package plugin

import (
	"encoding/json"
	"regexp"
	"slices"
	"strings"
)

// PanelSettings declares native controls for the plugin's own options. No
// plugin script runs in the window; it supplies labels and scalar fields.
type PanelSettings struct {
	Groups []SettingsGroup `json:"groups"`
}
type SettingsGroup struct {
	Title  string            `json:"title"`
	Titles map[string]string `json:"titles,omitempty"`
	Fields []SettingsField   `json:"fields"`
}
type SettingsField struct {
	Key          string            `json:"key"`
	Type         string            `json:"type"`
	Title        string            `json:"title"`
	Titles       map[string]string `json:"titles,omitempty"`
	Description  string            `json:"description,omitempty"`
	Descriptions map[string]string `json:"descriptions,omitempty"`
	Default      any               `json:"default,omitempty"`
	Optional     bool              `json:"optional,omitempty"`
	Nullable     bool              `json:"nullable,omitempty"`
	Minimum      *float64          `json:"minimum,omitempty"`
	Maximum      *float64          `json:"maximum,omitempty"`
	Choices      []SettingsChoice  `json:"choices,omitempty"`
	When         map[string][]any  `json:"when,omitempty"`
}
type SettingsChoice struct {
	Value  string            `json:"value"`
	Title  string            `json:"title"`
	Titles map[string]string `json:"titles,omitempty"`
}

var optionPath = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$`)

func safeOptionKey(key string) bool {
	if !optionPath.MatchString(key) {
		return false
	}
	for _, part := range strings.Split(key, ".") {
		if slices.Contains([]string{"__proto__", "constructor", "prototype"}, part) {
			return false
		}
	}
	return true
}
func panelSettings(raw json.RawMessage) *PanelSettings {
	var out PanelSettings
	if len(raw) > 65536 || json.Unmarshal(raw, &out) != nil || len(out.Groups) == 0 || len(out.Groups) > 8 {
		return nil
	}
	seen := map[string]bool{}
	for _, group := range out.Groups {
		if group.Title == "" || len(group.Fields) == 0 {
			return nil
		}
		for _, field := range group.Fields {
			if len(seen) >= 64 || seen[field.Key] || !safeOptionKey(field.Key) || field.Title == "" || (field.Optional && field.Type == "string") || !slices.Contains([]string{"boolean", "integer", "number", "string"}, field.Type) {
				return nil
			}
			if field.Minimum != nil && field.Maximum != nil && *field.Minimum > *field.Maximum {
				return nil
			}
			if len(field.Choices) > 32 || (len(field.Choices) > 0 && field.Type != "string") {
				return nil
			}
			for key, values := range field.When {
				if !safeOptionKey(key) || len(values) == 0 || len(values) > 32 {
					return nil
				}
			}
			seen[field.Key] = true
		}
	}
	return &out
}
