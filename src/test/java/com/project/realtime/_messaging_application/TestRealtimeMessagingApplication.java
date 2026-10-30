package com.project.realtime._messaging_application;

import org.springframework.boot.SpringApplication;

public class TestRealtimeMessagingApplication {

	public static void main(String[] args) {
		SpringApplication.from(RealtimeMessagingApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
