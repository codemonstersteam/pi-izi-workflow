package library.books;

import library.books.model.Book;
import library.datastore.IResourceStore;

import java.util.List;

/**
 * Persistence contract for books.
 */
public interface IBookStore extends IResourceStore<Book> {

    List<Book> readAll() throws IResourceStore.ResourceStoreException;
}
