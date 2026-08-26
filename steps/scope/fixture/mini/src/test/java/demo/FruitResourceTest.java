package demo;

import org.junit.jupiter.api.Test;

public class FruitResourceTest {

    @Test
    public void listsFruits() {
        new FruitResource().list();
    }
}
