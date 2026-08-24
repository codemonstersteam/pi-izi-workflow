package ai.labs.eddi.backup.impl;

/**
 * Export of an agent into a ZIP archive. Every referenced configuration is written next to the
 * agent as {id}.<type>.json plus {id}.descriptor.json, so that an import can restore the set.
 */
public class ExportServiceImpl {
    public void exportAgent(String agentId, Integer version) { }

    private String descriptorFileName(String id) { return id + ".descriptor.json"; }
}
