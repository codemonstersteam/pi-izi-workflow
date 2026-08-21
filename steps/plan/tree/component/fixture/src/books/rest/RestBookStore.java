package library.books.rest;

import library.books.IBookStore;
import library.books.model.Book;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.core.Response;

/**
 * REST entry point for books.
 */
@ApplicationScoped
public class RestBookStore implements IRestBookStore {

    private final IBookStore bookStore;

    @Inject
    public RestBookStore(IBookStore bookStore) {
        this.bookStore = bookStore;
    }

    @Override
    public Response createBook(Book book) {
        try {
            return Response.created(bookStore.create(book).getUri()).build();
        } catch (ResourceStoreException e) {
            return Response.status(400).entity(e.getMessage()).build();
        }
    }
}
