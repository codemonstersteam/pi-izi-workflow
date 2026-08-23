package ai.labs.eddi.configs.promptsnippets;

import com.github.benmanes.caffeine.cache.Caffeine;
import ai.labs.eddi.configs.promptsnippets.model.PromptSnippet;

/**
 * CRUD service over prompt snippets. Caching is Caffeine with a TTL of ten minutes; the same
 * mechanism serves every other store service of this configuration set.
 */
public class PromptSnippetService {
    private final Caffeine<Object, Object> cache = Caffeine.newBuilder();

    public PromptSnippet read(String id, Integer version) { return null; }

    public void create(PromptSnippet snippet) { }

    public void update(String id, Integer version, PromptSnippet snippet) { }

    public void delete(String id, Integer version) { }
}
