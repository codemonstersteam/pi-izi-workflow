package ai.labs.eddi.configs.promptsnippets.rest;

/**
 * REST endpoint of the prompt snippet store. Every store of this repository follows the same route
 * pattern: /<thing>store/<things>, listed by the configuration set.
 */
public interface IRestPromptSnippetStore {
    String resourceURI = "eddi://ai.labs.promptsnippet";

    Object readPromptSnippets(Integer index, Integer limit);

    Object readPromptSnippet(String id, Integer version);
}
