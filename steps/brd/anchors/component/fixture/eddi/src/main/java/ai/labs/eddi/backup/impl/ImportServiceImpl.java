package ai.labs.eddi.backup.impl;

/**
 * Import of an agent ZIP archive. Documents are merged by resource URI: an existing resource is
 * upgraded when the imported version wins, otherwise the archive entry is skipped.
 */
public class ImportServiceImpl {
    public void importAgent(byte[] zipArchive) { }

    private boolean newVersionWins(Integer existing, Integer imported) { return imported > existing; }
}
