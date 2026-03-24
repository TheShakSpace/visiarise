const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const createApp = require('../createApp');
const User = require('../models/User');

describe('Projects & chat API', () => {
  let app;
  let mongoServer;
  let token;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.JWT_SECRET = 'test-jwt-secret-visiarise-integration';
    await mongoose.connect(mongoServer.getUri());
    app = createApp();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    const cols = mongoose.connection.collections;
    for (const key of Object.keys(cols)) {
      await cols[key].deleteMany({});
    }
    const u = await User.create({
      name: 'Test',
      email: 'tester@example.com',
      password: 'secret12',
      isVerified: true,
    });
    token = jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  });

  it('creates and lists projects', async () => {
    const create = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'P1', description: 'D1' })
      .expect(201);
    expect(create.body.project.id).toBeDefined();
    expect(create.body.project.name).toBe('P1');

    const list = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.projects).toHaveLength(1);
    expect(list.body.projects[0].name).toBe('P1');
  });

  it('patches modelUrls and persists chat with Meshy links', async () => {
    const create = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'P2' })
      .expect(201);
    const pid = create.body.project.id;

    await request(app)
      .patch(`/api/projects/${pid}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        modelUrl: 'https://example.com/m.glb',
        modelUrls: { glb: 'https://example.com/m.glb', fbx: 'https://example.com/m.fbx' },
        meshyTaskId: 'meshy-task-1',
      })
      .expect(200);

    const getOne = await request(app)
      .get(`/api/projects/${pid}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(getOne.body.project.modelUrls.fbx).toContain('example.com');

    await request(app)
      .post(`/api/projects/${pid}/chat`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'user', content: 'hello', clientMessageId: 'c1' })
      .expect(201);

    await request(app)
      .post(`/api/projects/${pid}/chat`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        role: 'assistant',
        content: 'done',
        modelUrl: 'https://example.com/m.glb',
        modelUrls: { glb: 'https://example.com/m.glb' },
        meshyTaskId: 'meshy-task-1',
        clientMessageId: 'c2',
      })
      .expect(201);

    const chat = await request(app)
      .get(`/api/projects/${pid}/chat`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(chat.body.messages).toHaveLength(2);
    expect(chat.body.messages[1].modelUrls.glb).toContain('example.com');
  });

  it('returns 401 without token', async () => {
    await request(app).get('/api/projects').expect(401);
  });
});
