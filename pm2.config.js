module.exports = {
  apps: [
    {
      name: 'api-openai-quiz',
      script: 'nx serve',
      watch: false,
      max_memory_restart: '100M',
      restart_delay: 5000,
    },
  ],
};
