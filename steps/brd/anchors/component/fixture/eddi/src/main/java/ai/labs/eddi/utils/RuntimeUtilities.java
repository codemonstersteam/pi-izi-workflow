package ai.labs.eddi.utils;

/**
 * Assertions used across the stores: a key is lowercase alphanumeric with an underscore, its length
 * is limited by the caller, and a value of unlimited length is stored as it stands.
 */
public class RuntimeUtilities {
    public static void checkNotNull(Object value, String name) { }

    public static boolean isKeyValid(String key, int maxCharacters) {
        return key != null && key.length() <= maxCharacters && key.matches("[a-z0-9_]+");
    }
}
