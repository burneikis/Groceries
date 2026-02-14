module.exports = {
  apps: [{
    name: 'groceries',
    script: 'src/server.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      DATABASE_PATH: './data/grocery.db',
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '200M',
  }],
};
