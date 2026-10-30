package com.project.realtime._messaging_application;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RealtimeMessagingApplicationTests {

	@Test
	void contextLoads() {
	}

}
