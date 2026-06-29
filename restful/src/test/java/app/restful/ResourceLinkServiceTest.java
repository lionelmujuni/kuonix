package app.restful;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import app.restful.dto.ExifData;
import app.restful.dto.ResourceLink;
import app.restful.services.ResourceLinkService;

/** Unit tests for the EXIF-tailored search-link builder. */
public class ResourceLinkServiceTest {

    private final ResourceLinkService service = new ResourceLinkService();

    private static ExifData camera(String model) {
        return new ExifData(null, null, null, null, model, null, null, null);
    }

    @Test
    void buildsGoogleAndYoutubeSearchLinks() {
        List<ResourceLink> links = service.searchLinks("reduce noise low light", camera("Nikon Z6"));
        assertEquals(2, links.size());
        assertTrue(links.stream().allMatch(l -> "search".equals(l.type())));
        assertTrue(links.stream().anyMatch(l -> l.url().startsWith("https://www.google.com/search?q=")));
        assertTrue(links.stream().anyMatch(l -> l.url().startsWith("https://www.youtube.com/results?search_query=")));
    }

    @Test
    void seedsQueryWithCameraModelUrlEncoded() {
        ResourceLink google = service.searchLinks("white balance grey card", camera("Canon EOS R5"))
                .stream().filter(l -> l.url().contains("google.com")).findFirst().orElseThrow();
        // "Canon EOS R5 white balance grey card" → spaces encoded as '+'
        assertTrue(google.url().contains("Canon+EOS+R5"), google.url());
        assertTrue(google.url().contains("white+balance"), google.url());
    }

    @Test
    void omitsCameraWhenUnknown() {
        ResourceLink google = service.searchLinks("haze polarising filter", camera(null))
                .stream().filter(l -> l.url().contains("google.com")).findFirst().orElseThrow();
        assertTrue(google.url().endsWith("haze+polarising+filter"), google.url());
    }

    @Test
    void blankTermsProduceNoLinks() {
        assertTrue(service.searchLinks("", camera("Sony A7")).isEmpty());
        assertTrue(service.searchLinks(null, camera("Sony A7")).isEmpty());
    }

    @Test
    void nullExifIsHandled() {
        assertFalse(service.searchLinks("exposure triangle", null).isEmpty());
    }
}
