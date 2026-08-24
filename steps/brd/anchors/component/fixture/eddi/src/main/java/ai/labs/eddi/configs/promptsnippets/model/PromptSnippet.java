package ai.labs.eddi.configs.promptsnippets.model;

/**
 * A prompt snippet resource: the configuration type every other snippet-like type is modeled after.
 * Fields are id, version and the snippet body; the resource type is eddi://ai.labs.promptsnippet.
 */
public class PromptSnippet {
    private String id;
    private Integer version;
    private String key;
    private String value;

    public String getId() { return id; }
    public Integer getVersion() { return version; }
    public String getKey() { return key; }
    public String getValue() { return value; }
}
