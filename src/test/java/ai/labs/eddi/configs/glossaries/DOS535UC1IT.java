package ai.labs.eddi.configs.glossaries;

import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;
import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@DisplayName("DOS-535 UC1: Glossary Creation")
class DOS535UC1IT {

    @LocalServerPort
    private int port;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        RestAssured.basePath = "";
    }

    @Test
    @DisplayName("UC1 Step 1: Successfully create glossary with valid terms")
    void createGlossaryWithValidTerms() {
        Map<String, Object> requestBody = Map.of(
            "terms", List.of(
                Map.of("key", "greeting", "value", "Hello"),
                Map.of("key", "farewell", "value", "Goodbye")
            )
        );

        given()
            .contentType(ContentType.JSON)
            .body(requestBody)
        .when()
            .post("/glossarystore/glossaries")
        .then()
            .statusCode(201)
            .body("version", equalTo(1))
            .body("terms", notNullValue());
    }

    @Test
    @DisplayName("UC1 Step 3a: Glossary validation error returns 400")
    void createGlossaryWithInvalidTerms() {
        Map<String, Object> requestBody = Map.of(
            "terms", List.of(
                Map.of("key", "", "value", "Empty key"),
                Map.of("key", "valid", "value", "")
            )
        );

        given()
            .contentType(ContentType.JSON)
            .body(requestBody)
        .when()
            .post("/glossarystore/glossaries")
        .then()
            .statusCode(400)
            .body("error", notNullValue());
    }
}
