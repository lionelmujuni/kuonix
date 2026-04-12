package app.restful;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class RestfulApplication {

	public static void main(String[] args) {
		// Set Tomcat file count limit before starting application
		System.setProperty("org.apache.tomcat.util.http.fileupload.FileUploadBase.FILE_COUNT_MAX", "50000");
		SpringApplication.run(RestfulApplication.class, args);
	}

}
