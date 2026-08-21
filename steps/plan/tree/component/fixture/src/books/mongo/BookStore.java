package library.books.mongo;

import library.books.IBookStore;
import library.books.model.Book;
import library.datastore.AbstractResourceStore;
import library.datastore.IResourceStorageFactory;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.List;
import java.util.regex.Pattern;

/**
 * MongoDB store for {@link Book} documents.
 */
@ApplicationScoped
public class BookStore extends AbstractResourceStore<Book> implements IBookStore {

    private static final Pattern TITLE_PATTERN = Pattern.compile("[\\w ]{1,120}");

    @Inject
    public BookStore(IResourceStorageFactory storageFactory) {
        super(storageFactory, "books", Book.class);
    }

    @Override
    @ConfigurationUpdate
    public IResourceId create(Book book) throws ResourceStoreException {
        validateTitle(book);
        return super.create(book);
    }

    @Override
    @ConfigurationUpdate
    public Integer update(String id, Integer version, Book book)
            throws ResourceStoreException, ResourceModifiedException, ResourceNotFoundException {
        validateTitle(book);
        return super.update(id, version, book);
    }

    @Override
    public List<Book> readAll() throws ResourceStoreException {
        return storage.readAll();
    }

    private static void validateTitle(Book book) throws ResourceStoreException {
        if (book.getTitle() == null || !TITLE_PATTERN.matcher(book.getTitle()).matches()) {
            throw new ResourceStoreException("Book title must match [\\w ]{1,120}");
        }
    }
}
