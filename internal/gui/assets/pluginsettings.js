// Native controls for declarative community-plugin settings. The plugin
// supplies data, and only magpie's own component kit runs in the window.
window.pluginSettingsFill = async function (body, entry) {
  const ui = magpie.ui;
  const title = (x) => x.titles?.[locale] || (locale === "zh-TW" && x.titles?.zh) || x.title;
  const get = (o, key) => key.split(".").reduce((v, k) => v && Object.hasOwn(v, k) ? v[k] : undefined, o);
  const put = (o, key, value) => {
    const parts = key.split(".");
    if (parts.some((k) => ["__proto__", "constructor", "prototype"].includes(k))) throw new Error("Invalid option key");
    let at = o;
    for (const k of parts.slice(0, -1)) {
      if (!at[k] || typeof at[k] !== "object" || Array.isArray(at[k])) at[k] = {};
      at = at[k];
    }
    if (value === undefined) delete at[parts.at(-1)]; else at[parts.at(-1)] = value;
  };
  let values, saving = false;
  const changes = new Map(), rows = [], inputs = [], panes = [];
  let tabs;
  const fields = entry.settings.groups.flatMap((g) => g.fields);
  const current = (key) => get(values, key) ?? fields.find((f) => f.key === key)?.default;
  const active = (field) => Object.entries(field.when || {}).every(([key, accepted]) => accepted.includes(current(key)));
  const message = ui.el("span", "note"); message.setAttribute("role", "status");
  const save = ui.button(t("Save"), async () => {
    if (saving) return;
    for (const [field, input, pane] of inputs) if (active(field) && !input.hidden && !input.checkValidity()) {
      tabs.querySelectorAll("button")[panes.indexOf(pane)].click(); input.reportValidity(); input.focus(); return;
    }
    saving = true; updateControls(); save.disabled = true; save.textContent = t("Saving…");
    try {
      // Preserve options changed by another editor and all unexposed fields.
      const next = await api("plugin-pages/options", { spec: entry.spec });
      for (const [key, value] of changes) put(next, key, value);
      await api("plugin-pages/options", { spec: entry.spec, options: next });
      changes.clear(); message.textContent = t("Saved");
    } catch (err) { message.textContent = String(err.message || err); }
    finally { saving = false; updateControls(); save.textContent = t("Save"); save.disabled = !changes.size; }
  });
  save.disabled = true;
  function changed(key, value) {
    if (saving) return;
    put(values, key, value); changes.set(key, value); message.textContent = ""; save.disabled = false;
    updateControls();
  }
  function updateControls() {
    for (const [field, row] of rows) {
      const enabled = active(field) && !saving;
      row.classList.toggle("disabled", !enabled);
      for (const control of row.querySelectorAll("button,input")) control.disabled = !enabled;
    }
  }
  const loading = ui.el("span", "note", t("Loading…")); body.replaceChildren(loading);
  try { values = await api("plugin-pages/options", { spec: entry.spec }); }
  catch (err) {
    loading.textContent = String(err.message || err);
    body.append(ui.button(t("Try again"), () => pluginSettingsFill(body, entry))); return;
  }
  if (!body.isConnected) return;
  const groupBox = ui.el("div", "plugin-settings-groups");
  const choose = (index) => panes.forEach((pane, i) => { pane.hidden = i !== index; });
  tabs = segs(entry.settings.groups.map((group, i) => [i, title(group)]), 0, choose);
  groupBox.append(tabs);
  for (const group of entry.settings.groups) {
    const section = ui.el("section", "list prefs ag-prefs");
    panes.push(section);
    for (const field of group.fields) {
      const value = get(values, field.key) ?? field.default;
      const label = title(field);
      const description = field.descriptions?.[locale] || (locale === "zh-TW" && field.descriptions?.zh) || field.description || "";
      let control;
      if (field.type === "boolean" && !field.optional) control = ui.toggle(!!value, label, (v) => changed(field.key, v));
      else if (field.choices?.length) control = ui.menu(field.choices.map((c) => ({ v: c.value, name: title(c) })), value, label, (v) => changed(field.key, v));
      else if (field.optional) {
        const choices = [{ v: "keep", name: t("Keep existing") }];
        if (field.nullable) choices.push({ v: "default", name: t("Default") });
        if (field.type === "boolean") choices.push({ v: "true", name: t("On") }, { v: "false", name: t("Off") });
        else choices.push({ v: "custom", name: t("Custom") });
        const raw = get(values, field.key);
        const mode = raw === undefined ? "keep" : raw === null ? "default" : field.type === "boolean" ? String(raw) : "custom";
        control = ui.el("div", "plugin-setting-controls");
        let input;
        const menu = ui.menu(choices, mode, label, (v) => {
          if (input) { input.hidden = v !== "custom"; input.required = !input.hidden; }
          changed(field.key, v === "keep" ? undefined : v === "default" ? null : v === "custom" ? (input.value === "" ? undefined : input.valueAsNumber) : v === "true");
          if (input && !input.hidden) input.focus();
        });
        control.append(menu);
        if (field.type !== "boolean") {
          input = ui.el("input", "set-field"); input.type = "number"; input.value = typeof raw === "number" ? raw : "";
          input.hidden = mode !== "custom"; input.required = !input.hidden; input.step = field.type === "integer" ? "1" : "any";
          if (field.minimum !== undefined) input.min = field.minimum;
          if (field.maximum !== undefined) input.max = field.maximum;
          input.setAttribute("aria-label", label);
          input.oninput = () => { if (input.checkValidity()) changed(field.key, input.valueAsNumber); };
          inputs.push([field, input, section]); control.append(input);
        }
      } else {
        const schema = { properties: { [field.key]: { ...field, title: label } } };
        const [built] = ui.form(schema, { [field.key]: value }, (patch) => changed(field.key, patch[field.key]));
        control = built.lastElementChild;
        if (field.type !== "string") inputs.push([field, control, section]);
      }
      const row = ui.row(label, description, control); row.dataset.option = field.key; row.title = field.key;
      for (const c of row.querySelectorAll("button,input")) c.disabled = !active(field);
      if (!active(field)) row.classList.add("disabled");
      rows.push([field, row]); section.append(row);
    }
    groupBox.append(section);
  }
  choose(0);
  const actions = ui.el("div", "plugin-settings-actions"); actions.append(save, message);
  body.replaceChildren(groupBox, actions);
};
