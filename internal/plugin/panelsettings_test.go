package plugin

import (
	"encoding/json"
	"testing"
)

func TestPanelSettingsRejectUnsafeOrAmbiguousFields(t *testing.T) {
	valid := `{"groups":[{"title":"VLM","fields":[{"key":"vlmParameters.max_tokens","type":"integer","title":"Max output","optional":true,"nullable":true,"minimum":1}]}]}`
	if panelSettings(json.RawMessage(valid)) == nil {
		t.Fatal("valid native settings rejected")
	}
	for _, field := range []string{
		`{"key":"constructor.prototype","type":"string","title":"Bad"}`,
		`{"key":"x","type":"object","title":"Bad"}`,
		`{"key":"x","type":"number","title":"Bad","minimum":2,"maximum":1}`,
		`{"key":"x","type":"string","title":"Bad","choices":[{"value":"a","title":"A"}]},{"key":"x","type":"string","title":"Again"}`,
	} {
		raw := `{"groups":[{"title":"VLM","fields":[` + field + `]}]}`
		if panelSettings(json.RawMessage(raw)) != nil {
			t.Errorf("accepted invalid settings: %s", raw)
		}
	}
}
