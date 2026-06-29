package app.restful;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import app.restful.dto.AppModules;
import app.restful.dto.OllamaSettings;

/**
 * Phase 3b — AI is gated by configuration, not a manual toggle. Verifies the
 * config-derived semantics of OllamaSettings and the derived aiAssistant flag.
 */
public class AiGatingTest {

    @Test
    void configuredRequiresValidKeyAndCompleteSettings() {
        // Default settings have a blank key → not configured.
        assertFalse(OllamaSettings.defaults().isConfigured());

        // A valid key + complete config is "configured" regardless of the
        // vestigial enabled flag (here false) — the toggle no longer gates AI.
        OllamaSettings ok = new OllamaSettings(false, "sk-123", "qwen3.5:cloud",
                "https://api.ollama.com", 0.3, 1024);
        assertTrue(ok.isConfigured());

        // A key with incomplete config is not usable.
        OllamaSettings partial = new OllamaSettings(true, "sk-123", "",
                "https://api.ollama.com", 0.3, 1024);
        assertFalse(partial.isConfigured());
    }

    @Test
    void blankKeyIsValidToSaveButIncompleteKeyedConfigIsNot() {
        assertTrue(OllamaSettings.defaults().isValid(), "blank key means AI off — always valid");

        OllamaSettings partial = new OllamaSettings(true, "sk-123", "",
                "https://api.ollama.com", 0.3, 1024);
        assertFalse(partial.isValid(), "once a key is provided the rest must be complete");
    }

    @Test
    void withAiAssistantOverridesOnlyThatFlag() {
        AppModules base = AppModules.defaults();
        AppModules off = base.withAiAssistant(false);

        assertFalse(off.aiAssistant());
        assertEquals(base.editing(), off.editing());
        assertEquals(base.batchProcessing(), off.batchProcessing());
        assertEquals(base.rawDecode(), off.rawDecode());
        assertEquals(base.cameraFeedback(), off.cameraFeedback());
        assertEquals(base.styleProfiles(), off.styleProfiles());
    }
}
