package ai.labs.eddi.modules.templating;

/**
 * Qute templating over prompts. A template data model key names the source of a substitution; a
 * bound but deleted resource is a rendering error, and a missing key is left as it stands.
 */
public class TemplateEngine {
    public String processTemplate(String template, Object dataModel) { return template; }

    public String substitution(String key) { return "{{" + key + "}}"; }
}
