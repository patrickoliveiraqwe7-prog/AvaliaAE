const { expect } = require('chai');
const request = require('supertest');
const path = require('path');

let server;
let app;

describe('Token flows (integration)', function() {
  this.timeout(10000);
  before((done) => {
    // start server by requiring it
    const srv = require(path.join(__dirname, '..', 'server.js'));
    app = srv.app;
    // wait a bit for DB init
    setTimeout(done, 800);
  });

  it('login-admin should return token', async () => {
    const res = await request(app).post('/login-admin').send({ login: 'admin', senha: 'NovaSenha123!' });
    expect(res.status).to.be.oneOf([200,201]);
    expect(res.body).to.have.property('token');
  });

  it('should allow admin to generate estagiario token', async () => {
    // login to get admin token
    const r = await request(app).post('/login-admin').send({ login: 'admin', senha: 'NovaSenha123!' });
    expect(r.status).to.equal(200);
    const t = r.body.token;
    const auth = { Authorization: 'Bearer ' + t };
    // create estagiario test user
    await request(app).post('/estagiario').send({ nome: 'Spec Test', login: 'spec_test', senha: 'Senha1234' });
  const gen = await request(app).post('/admin/token/estagiario').set(auth).send({ login: 'spec_test' });
  if (![200,201].includes(gen.status)) console.log('GEN ERR BODY', gen.status, gen.body);
  expect([200,201]).to.include(gen.status);
  // in dev the token is returned
  if (process.env.NODE_ENV !== 'production') expect(gen.body).to.have.property('token');
  });
});
