/*
 * Copyright Library contributors
 */
package library.books.model;

import java.time.LocalDate;

/**
 * Data model for a book document.
 */
public class Book {

    private String id;
    private Integer version;
    private String title;
    private LocalDate addedOn;

    public Book() {
    }

    public Book(String title) {
        this.title = title;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public Integer getVersion() {
        return version;
    }
}
