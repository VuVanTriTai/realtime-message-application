package com.project.realtime._messaging_application.config;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;

import java.util.concurrent.Executor;

/**
 * AsyncConfig — Cau hinh thread pool cho cac tac vu nang va scheduler.
 *
 * Nguyen tac co ban:
 *   WebSocket/STOMP handler (ChatWebSocketHandler) chay tren STOMP channel thread.
 *   Neu handler goi truc tiep DB/Redis ma bi block lau → tat ca STOMP frames phai cho.
 *   Giai phap: "viec nhe" giu tren STOMP thread, "viec nang" day sang taskExecutor.
 *
 * Phan loai viec:
 *   Nhe  (STOMP thread OK):
 *     - Xac thuc user tu session header  → O(1)
 *     - Rate limit check (Redis INCR)    → < 1ms round-trip
 *     - Publish typing/read_receipt      → 1 Redis PUBLISH < 1ms
 *
 *   Nang  (phai dung thread pool rieng):
 *     - messageService.sendMessage()     → INSERT vao PostgreSQL (5-20ms)
 *     - OutboxPoller.pollAndPublish()    → SELECT + UPDATE outbox  (5-30ms)
 * outboxTaskScheduler (outbox-scheduler-*)
 *      Dung boi: SchedulingConfigurer.configureTasks() → tat ca @Scheduled method
 *      hien tai chay tren pool nay thay vi Spring default single-thread scheduler.
 *      Muc dich: OutboxPoller co nhieu hon 1 thread de xu ly batch song song.
 *
 * Tai sao dung SchedulingConfigurer thay vi @Scheduled(scheduler="beanName")?
 *   - @Scheduled khong co thuoc tinh scheduler (chi co fixedDelay/fixedRate/cron).
 *   - SchedulingConfigurer la cach chinh thuc cua Spring de doi scheduling pool.
 */
@Configuration
@EnableAsync
@EnableScheduling
public class AsyncConfig implements SchedulingConfigurer {

    // ================================================================
    // 1. taskExecutor — viec nang tu WebSocket handler (DB write)
    // ================================================================

    /**
     * Thread pool danh cho viec nang: messageService.sendMessage() (PostgreSQL INSERT).
     *
     * Sizing:
     *   corePoolSize = 50  : luon co san 50 thread, tranh khoi tao moi
     *   maxPoolSize  = 200 : burst khi spike (10k conn, ~10-30% gui tin/luc)
     *   queueCapacity= 500 : hang doi truoc khi tang len max (backpressure nhe)
     *
     * CallerRunsPolicy: khi queue day va da dat max → STOMP thread tu chay
     * thay vi nem RejectedExecutionException (mat ket noi client).
     */
    @Bean(name = {"taskExecutor", "applicationTaskExecutor"})
    public Executor taskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(35);
        executor.setMaxPoolSize(50);
        executor.setQueueCapacity(500);
        executor.setThreadNamePrefix("chat-worker-");
        executor.setRejectedExecutionHandler(
                new java.util.concurrent.ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        executor.initialize();
        return executor;
    }

    // ================================================================
    // 2. outboxTaskScheduler — OutboxPoller @Scheduled chay o day
    // ================================================================

    /**
     * TaskScheduler danh cho tat ca @Scheduled method (OutboxPoller.pollAndPublish,
     * OutboxPoller.cleanupDone, v.v.).
     *
     * Thay the Spring default: 1 single-thread ScheduledThreadPoolExecutor.
     * Voi poolSize=4: OutboxPoller va cac scheduled job khac chay song song,
     * khong bi chen cho nhau.
     *
     * Luu y: ThreadPoolTaskScheduler (khac ThreadPoolTaskExecutor) —
     * TaskScheduler co kha nang lap lich theo thoi gian, TaskExecutor thi khong.
     */
    @Bean(name = "outboxTaskScheduler")
    public TaskScheduler outboxTaskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(4);
        scheduler.setThreadNamePrefix("outbox-scheduler-");
        scheduler.setWaitForTasksToCompleteOnShutdown(true);
        scheduler.setAwaitTerminationSeconds(10);
        scheduler.initialize();
        return scheduler;
    }

    /**
     * SchedulingConfigurer: dang ky outboxTaskScheduler lam scheduler mac dinh
     * cho tat ca @Scheduled method trong ung dung.
     *
     * Khong can sua OutboxPoller — @Scheduled van giu nguyen,
     * chi can override scheduler o day la du.
     */
    @Override
    public void configureTasks(ScheduledTaskRegistrar taskRegistrar) {
        taskRegistrar.setTaskScheduler(outboxTaskScheduler());
    }
}
