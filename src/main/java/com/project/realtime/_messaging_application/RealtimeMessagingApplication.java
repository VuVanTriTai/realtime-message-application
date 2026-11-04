package com.project.realtime._messaging_application;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class RealtimeMessagingApplication {

	public static void main(String[] args) {
		SpringApplication.run(RealtimeMessagingApplication.class, args);
	}

}
