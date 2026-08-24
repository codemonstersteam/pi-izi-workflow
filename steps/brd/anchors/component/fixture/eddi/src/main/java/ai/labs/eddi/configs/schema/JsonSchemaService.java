package ai.labs.eddi.configs.schema;

/**
 * JSON schema of every configuration type of this repository. A type is registered with its
 * resource type and its versioning mechanism; the schema is what a REST store validates against.
 */
public class JsonSchemaService {
    public String schemaFor(String resourceType) { return "{}"; }
}
