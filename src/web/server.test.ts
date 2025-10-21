import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebServer } from './server.js';

describe('WebServer', () => {
  let webServer: WebServer;

  beforeEach(() => {
    webServer = new WebServer();
  });

  afterEach(async () => {
    if (webServer) {
      await webServer.stop();
    }
  });

  describe('Health check endpoint', () => {
    it('should return 200 for health check', async () => {
      await webServer.start();
      
      const response = await webServer.getFastifyInstance().inject({
        method: 'GET',
        url: '/healthz'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('status', 'ok');
      expect(response.json()).toHaveProperty('timestamp');
      expect(response.json()).toHaveProperty('uptime');
    });
  });

  describe('Metrics endpoint', () => {
    it('should return metrics in JSON format', async () => {
      await webServer.start();
      
      const response = await webServer.getFastifyInstance().inject({
        method: 'GET',
        url: '/metrics'
      });

      expect(response.statusCode).toBe(200);
      const metrics = response.json();
      
      expect(metrics).toHaveProperty('guilds');
      expect(metrics).toHaveProperty('vehicles');
      expect(metrics).toHaveProperty('subscriptions');
      expect(metrics).toHaveProperty('polls');
      expect(metrics).toHaveProperty('latencies');
      expect(metrics).toHaveProperty('uptime');
      
      expect(metrics.polls).toHaveProperty('total');
      expect(metrics.polls).toHaveProperty('successful');
      expect(metrics.polls).toHaveProperty('failed');
      
      expect(metrics.latencies).toHaveProperty('average');
      expect(metrics.latencies).toHaveProperty('min');
      expect(metrics.latencies).toHaveProperty('max');
    });
  });

  describe('Root endpoint', () => {
    it('should return bot information', async () => {
      await webServer.start();
      
      const response = await webServer.getFastifyInstance().inject({
        method: 'GET',
        url: '/'
      });

      expect(response.statusCode).toBe(200);
      const info = response.json();
      
      expect(info).toHaveProperty('name', 'RSS Véhicules Bot');
      expect(info).toHaveProperty('version', '1.0.0');
      expect(info).toHaveProperty('description');
      expect(info).toHaveProperty('endpoints');
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      await webServer.start();
      
      const response = await webServer.getFastifyInstance().inject({
        method: 'GET',
        url: '/unknown'
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toHaveProperty('error', 'Not Found');
    });
  });

  describe('Poll recording', () => {
    it('should record poll attempts', async () => {
      await webServer.start();
      
      // Enregistrer quelques tentatives de polling
      webServer.recordPoll(true, 1000);
      webServer.recordPoll(false, 2000);
      webServer.recordPoll(true, 1500);
      
      const response = await webServer.getFastifyInstance().inject({
        method: 'GET',
        url: '/metrics'
      });

      expect(response.statusCode).toBe(200);
      const metrics = response.json();
      
      expect(metrics.polls.total).toBe(3);
      expect(metrics.polls.successful).toBe(2);
      expect(metrics.polls.failed).toBe(1);
    });
  });
});
