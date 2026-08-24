package ai.labs.eddi.configs.agents.model;

import java.util.List;
import java.net.URI;

/**
 * The agent configuration. It references its prompt snippets by resource URI; anything a prompt
 * needs at rendering time is bound here, alongside the snippets, and nothing global is substituted.
 */
public class AgentConfiguration {
    private String id;
    private Integer version;
    private List<URI> promptSnippets;

    public List<URI> getPromptSnippets() { return promptSnippets; }
}
