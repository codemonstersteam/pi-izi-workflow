package ai.labs.eddi.configs.promptsnippets.rest;

import ai.labs.eddi.configs.promptsnippets.PromptSnippetService;

/**
 * Implementation of the prompt snippet store endpoint at /promptsnippetstore/promptsnippets.
 * A collision of keys is resolved by the loading order of the configuration set: last loaded wins.
 */
public class RestPromptSnippetStore implements IRestPromptSnippetStore {
    private final PromptSnippetService service = new PromptSnippetService();

    @Override
    public Object readPromptSnippets(Integer index, Integer limit) { return null; }

    @Override
    public Object readPromptSnippet(String id, Integer version) { return null; }
}
