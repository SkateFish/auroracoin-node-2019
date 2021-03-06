'use strict';

/* jshint sub: true */

var path = require('path');
var EventEmitter = require('events').EventEmitter;
var should = require('chai').should();
var crypto = require('crypto');
var bitcore = require('auroracoin');
var _ = bitcore.deps._;
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var fs = require('fs');
var sinon = require('sinon');

var index = require('../../lib');
var log = index.log;
var errors = index.errors;

var Transaction = bitcore.Transaction;
var readFileSync = sinon.stub().returns(fs.readFileSync(path.resolve(__dirname, '../data/auroracoin.conf')));
var AuroracoinService = proxyquire('../../lib/services/auroracoind', {
  fs: {
    readFileSync: readFileSync
  }
});
var defaultAuroracoinConf = fs.readFileSync(path.resolve(__dirname, '../data/default.auroracoin.conf'), 'utf8');

describe('Auroracoin Service', function() {
  var txhex = '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff0704ffff001d0104ffffffff0100f2052a0100000043410496b538e853519c726a2c91e61ec11600ae1390813a627c66fb8be7947be63c52da7589379515d4e0a604f8141781e62294721166bf621e73a82cbf2342c858eeac00000000';

  var baseConfig = {
    node: {
      network: bitcore.Networks.testnet
    },
    spawn: {
      datadir: 'testdir',
      exec: 'testpath'
    }
  };

  describe('@constructor', function() {
    it('will create an instance', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      should.exist(auroracoind);
    });
    it('will create an instance without `new`', function() {
      var auroracoind = AuroracoinService(baseConfig);
      should.exist(auroracoind);
    });
    it('will init caches', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      should.exist(auroracoind.utxosCache);
      should.exist(auroracoind.txidsCache);
      should.exist(auroracoind.balanceCache);
      should.exist(auroracoind.summaryCache);
      should.exist(auroracoind.transactionDetailedCache);

      should.exist(auroracoind.transactionCache);
      should.exist(auroracoind.rawTransactionCache);
      should.exist(auroracoind.blockCache);
      should.exist(auroracoind.rawBlockCache);
      should.exist(auroracoind.blockHeaderCache);
      should.exist(auroracoind.zmqKnownTransactions);
      should.exist(auroracoind.zmqKnownBlocks);
      should.exist(auroracoind.lastTip);
      should.exist(auroracoind.lastTipTimeout);
    });
    it('will init clients', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.nodes.should.deep.equal([]);
      auroracoind.nodesIndex.should.equal(0);
      auroracoind.nodes.push({client: sinon.stub()});
      should.exist(auroracoind.client);
    });
    it('will set subscriptions', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.subscriptions.should.deep.equal({
        address: {},
        rawtransaction: [],
        hashblock: []
      });
    });
  });

  describe('#_initDefaults', function() {
    it('will set transaction concurrency', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind._initDefaults({transactionConcurrency: 10});
      auroracoind.transactionConcurrency.should.equal(10);
      auroracoind._initDefaults({});
      auroracoind.transactionConcurrency.should.equal(5);
    });
  });

  describe('@dependencies', function() {
    it('will have no dependencies', function() {
      AuroracoinService.dependencies.should.deep.equal([]);
    });
  });

  describe('#getAPIMethods', function() {
    it('will return spec', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var methods = auroracoind.getAPIMethods();
      should.exist(methods);
      methods.length.should.equal(21);
    });
  });

  describe('#getPublishEvents', function() {
    it('will return spec', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var events = auroracoind.getPublishEvents();
      should.exist(events);
      events.length.should.equal(3);
      events[0].name.should.equal('auroracoind/rawtransaction');
      events[0].scope.should.equal(auroracoind);
      events[0].subscribe.should.be.a('function');
      events[0].unsubscribe.should.be.a('function');
      events[1].name.should.equal('auroracoind/hashblock');
      events[1].scope.should.equal(auroracoind);
      events[1].subscribe.should.be.a('function');
      events[1].unsubscribe.should.be.a('function');
      events[2].name.should.equal('auroracoind/addresstxid');
      events[2].scope.should.equal(auroracoind);
      events[2].subscribe.should.be.a('function');
      events[2].unsubscribe.should.be.a('function');
    });
    it('will call subscribe/unsubscribe with correct args', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.subscribe = sinon.stub();
      auroracoind.unsubscribe = sinon.stub();
      var events = auroracoind.getPublishEvents();

      events[0].subscribe('test');
      auroracoind.subscribe.args[0][0].should.equal('rawtransaction');
      auroracoind.subscribe.args[0][1].should.equal('test');

      events[0].unsubscribe('test');
      auroracoind.unsubscribe.args[0][0].should.equal('rawtransaction');
      auroracoind.unsubscribe.args[0][1].should.equal('test');

      events[1].subscribe('test');
      auroracoind.subscribe.args[1][0].should.equal('hashblock');
      auroracoind.subscribe.args[1][1].should.equal('test');

      events[1].unsubscribe('test');
      auroracoind.unsubscribe.args[1][0].should.equal('hashblock');
      auroracoind.unsubscribe.args[1][1].should.equal('test');
    });
  });

  describe('#subscribe', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'info');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will push to subscriptions', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var emitter = {};
      auroracoind.subscribe('hashblock', emitter);
      auroracoind.subscriptions.hashblock[0].should.equal(emitter);

      var emitter2 = {};
      auroracoind.subscribe('rawtransaction', emitter2);
      auroracoind.subscriptions.rawtransaction[0].should.equal(emitter2);
    });
  });

  describe('#unsubscribe', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'info');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will remove item from subscriptions', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var emitter1 = {};
      var emitter2 = {};
      var emitter3 = {};
      var emitter4 = {};
      var emitter5 = {};
      auroracoind.subscribe('hashblock', emitter1);
      auroracoind.subscribe('hashblock', emitter2);
      auroracoind.subscribe('hashblock', emitter3);
      auroracoind.subscribe('hashblock', emitter4);
      auroracoind.subscribe('hashblock', emitter5);
      auroracoind.subscriptions.hashblock.length.should.equal(5);

      auroracoind.unsubscribe('hashblock', emitter3);
      auroracoind.subscriptions.hashblock.length.should.equal(4);
      auroracoind.subscriptions.hashblock[0].should.equal(emitter1);
      auroracoind.subscriptions.hashblock[1].should.equal(emitter2);
      auroracoind.subscriptions.hashblock[2].should.equal(emitter4);
      auroracoind.subscriptions.hashblock[3].should.equal(emitter5);
    });
    it('will not remove item an already unsubscribed item', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var emitter1 = {};
      var emitter3 = {};
      auroracoind.subscriptions.hashblock= [emitter1];
      auroracoind.unsubscribe('hashblock', emitter3);
      auroracoind.subscriptions.hashblock.length.should.equal(1);
      auroracoind.subscriptions.hashblock[0].should.equal(emitter1);
    });
  });

  describe('#subscribeAddress', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'info');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will not an invalid address', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var emitter = new EventEmitter();
      auroracoind.subscribeAddress(emitter, ['invalidaddress']);
      should.not.exist(auroracoind.subscriptions.address['invalidaddress']);
    });
    it('will add a valid address', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var emitter = new EventEmitter();
      auroracoind.subscribeAddress(emitter, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      should.exist(auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
    });
    it('will handle multiple address subscribers', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var emitter1 = new EventEmitter();
      var emitter2 = new EventEmitter();
      auroracoind.subscribeAddress(emitter1, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      auroracoind.subscribeAddress(emitter2, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      should.exist(auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'].length.should.equal(2);
    });
    it('will not add the same emitter twice', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var emitter1 = new EventEmitter();
      auroracoind.subscribeAddress(emitter1, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      auroracoind.subscribeAddress(emitter1, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      should.exist(auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'].length.should.equal(1);
    });
  });

  describe('#unsubscribeAddress', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'info');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('it will remove a subscription', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var emitter1 = new EventEmitter();
      var emitter2 = new EventEmitter();
      auroracoind.subscribeAddress(emitter1, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      auroracoind.subscribeAddress(emitter2, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      should.exist(auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'].length.should.equal(2);
      auroracoind.unsubscribeAddress(emitter1, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'].length.should.equal(1);
    });
    it('will unsubscribe subscriptions for an emitter', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var emitter1 = new EventEmitter();
      var emitter2 = new EventEmitter();
      auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'] = [emitter1, emitter2];
      auroracoind.unsubscribeAddress(emitter1);
      auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'].length.should.equal(1);
    });
    it('will NOT unsubscribe subscription with missing address', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var emitter1 = new EventEmitter();
      var emitter2 = new EventEmitter();
      auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'] = [emitter1, emitter2];
      auroracoind.unsubscribeAddress(emitter1, ['LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo']);
      auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'].length.should.equal(2);
    });
    it('will NOT unsubscribe subscription with missing emitter', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var emitter1 = new EventEmitter();
      var emitter2 = new EventEmitter();
      auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'] = [emitter2];
      auroracoind.unsubscribeAddress(emitter1, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'].length.should.equal(1);
      auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'][0].should.equal(emitter2);
    });
    it('will remove empty addresses', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var emitter1 = new EventEmitter();
      var emitter2 = new EventEmitter();
      auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'] = [emitter1, emitter2];
      auroracoind.unsubscribeAddress(emitter1, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      auroracoind.unsubscribeAddress(emitter2, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      should.not.exist(auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
    });
    it('will unsubscribe emitter for all addresses', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var emitter1 = new EventEmitter();
      var emitter2 = new EventEmitter();
      auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'] = [emitter1, emitter2];
      auroracoind.subscriptions.address['LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo'] = [emitter1, emitter2];
      sinon.spy(auroracoind, 'unsubscribeAddressAll');
      auroracoind.unsubscribeAddress(emitter1);
      auroracoind.unsubscribeAddressAll.callCount.should.equal(1);
      auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'].length.should.equal(1);
      auroracoind.subscriptions.address['LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo'].length.should.equal(1);
    });
  });

  describe('#unsubscribeAddressAll', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'info');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will unsubscribe emitter for all addresses', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var emitter1 = new EventEmitter();
      var emitter2 = new EventEmitter();
      auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'] = [emitter1, emitter2];
      auroracoind.subscriptions.address['LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo'] = [emitter1, emitter2];
      auroracoind.subscriptions.address['mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'] = [emitter2];
      auroracoind.subscriptions.address['3CMNFxN1oHBc4R1EpboAL5yzHGgE611Xou'] = [emitter1];
      auroracoind.unsubscribeAddress(emitter1);
      auroracoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'].length.should.equal(1);
      auroracoind.subscriptions.address['LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo'].length.should.equal(1);
      auroracoind.subscriptions.address['mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'].length.should.equal(1);
      should.not.exist(auroracoind.subscriptions.address['3CMNFxN1oHBc4R1EpboAL5yzHGgE611Xou']);
    });
  });

  describe('#_getDefaultConfig', function() {
    it('will generate config file from defaults', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var config = auroracoind._getDefaultConfig();
      config.should.equal(defaultAuroracoinConf);
    });
  });

  describe('#_loadSpawnConfiguration', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'info');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will parse a auroracoin.conf file', function() {
      var TestAuroracoin = proxyquire('../../lib/services/auroracoind', {
        fs: {
          readFileSync: readFileSync,
          existsSync: sinon.stub().returns(true),
          writeFileSync: sinon.stub()
        },
        mkdirp: {
          sync: sinon.stub()
        }
      });
      var auroracoind = new TestAuroracoin(baseConfig);
      auroracoind.options.spawn.datadir = '/tmp/.auroracoin';
      var node = {};
      auroracoind._loadSpawnConfiguration(node);
      should.exist(auroracoind.spawn.config);
      auroracoind.spawn.config.should.deep.equal({
        addressindex: 1,
        checkblocks: 144,
        dbcache: 8192,
        maxuploadtarget: 1024,
        port: 20000,
        rpcport: 50001,
        rpcallowip: '127.0.0.1',
        rpcuser: 'auroracoin',
        rpcpassword: 'local321',
        server: 1,
        spentindex: 1,
        timestampindex: 1,
        txindex: 1,
        upnp: 0,
        whitelist: '127.0.0.1',
        zmqpubhashblock: 'tcp://127.0.0.1:29332',
        zmqpubrawtx: 'tcp://127.0.0.1:29332'
      });
    });
    it('will expand relative datadir to absolute path', function() {
      var TestAuroracoin = proxyquire('../../lib/services/auroracoind', {
        fs: {
          readFileSync: readFileSync,
          existsSync: sinon.stub().returns(true),
          writeFileSync: sinon.stub()
        },
        mkdirp: {
          sync: sinon.stub()
        }
      });
      var config = {
        node: {
          network: bitcore.Networks.testnet,
          configPath: '/tmp/.bitcore/auroracoin-node.json'
        },
        spawn: {
          datadir: './data',
          exec: 'testpath'
        }
      };
      var auroracoind = new TestAuroracoin(config);
      auroracoind.options.spawn.datadir = './data';
      var node = {};
      auroracoind._loadSpawnConfiguration(node);
      auroracoind.options.spawn.datadir.should.equal('/tmp/.bitcore/data');
    });
    it('should throw an exception if txindex isn\'t enabled in the configuration', function() {
      var TestAuroracoin = proxyquire('../../lib/services/auroracoind', {
        fs: {
          readFileSync: sinon.stub().returns(fs.readFileSync(__dirname + '/../data/badauroracoin.conf')),
          existsSync: sinon.stub().returns(true),
        },
        mkdirp: {
          sync: sinon.stub()
        }
      });
      var auroracoind = new TestAuroracoin(baseConfig);
      (function() {
        auroracoind._loadSpawnConfiguration({datadir: './test'});
      }).should.throw(bitcore.errors.InvalidState);
    });
    it('should NOT set https options if node https options are set', function() {
      var writeFileSync = function(path, config) {
        config.should.equal(defaultAuroracoinConf);
      };
      var TestAuroracoin = proxyquire('../../lib/services/auroracoind', {
        fs: {
          writeFileSync: writeFileSync,
          readFileSync: readFileSync,
          existsSync: sinon.stub().returns(false)
        },
        mkdirp: {
          sync: sinon.stub()
        }
      });
      var config = {
        node: {
          network: {
            name: 'regtest'
          },
          https: true,
          httpsOptions: {
            key: 'key.pem',
            cert: 'cert.pem'
          }
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testexec'
        }
      };
      var auroracoind = new TestAuroracoin(config);
      auroracoind.options.spawn.datadir = '/tmp/.auroracoin';
      var node = {};
      auroracoind._loadSpawnConfiguration(node);
    });
  });

  describe('#_checkConfigIndexes', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'warn');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('should warn the user if reindex is set to 1 in the auroracoin.conf file', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var config = {
        txindex: 1,
        addressindex: 1,
        spentindex: 1,
        server: 1,
        zmqpubrawtx: 1,
        zmqpubhashblock: 1,
        reindex: 1
      };
      var node = {};
      auroracoind._checkConfigIndexes(config, node);
      log.warn.callCount.should.equal(1);
      node._reindex.should.equal(true);
    });
    it('should warn if zmq port and hosts do not match', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var config = {
        txindex: 1,
        addressindex: 1,
        spentindex: 1,
        server: 1,
        zmqpubrawtx: 'tcp://127.0.0.1:29332',
        zmqpubhashblock: 'tcp://127.0.0.1:29331',
        reindex: 1
      };
      var node = {};
      (function() {
        auroracoind._checkConfigIndexes(config, node);
      }).should.throw('"zmqpubrawtx" and "zmqpubhashblock"');
    });
  });

  describe('#_resetCaches', function() {
    it('will reset LRU caches', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var keys = [];
      for (var i = 0; i < 10; i++) {
        keys.push(crypto.randomBytes(32));
        auroracoind.transactionDetailedCache.set(keys[i], {});
        auroracoind.utxosCache.set(keys[i], {});
        auroracoind.txidsCache.set(keys[i], {});
        auroracoind.balanceCache.set(keys[i], {});
        auroracoind.summaryCache.set(keys[i], {});
      }
      auroracoind._resetCaches();
      should.equal(auroracoind.transactionDetailedCache.get(keys[0]), undefined);
      should.equal(auroracoind.utxosCache.get(keys[0]), undefined);
      should.equal(auroracoind.txidsCache.get(keys[0]), undefined);
      should.equal(auroracoind.balanceCache.get(keys[0]), undefined);
      should.equal(auroracoind.summaryCache.get(keys[0]), undefined);
    });
  });

  describe('#_tryAllClients', function() {
    it('will retry for each node client', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.tryAllInterval = 1;
      auroracoind.nodes.push({
        client: {
          getInfo: sinon.stub().callsArgWith(0, new Error('test'))
        }
      });
      auroracoind.nodes.push({
        client: {
          getInfo: sinon.stub().callsArgWith(0, new Error('test'))
        }
      });
      auroracoind.nodes.push({
        client: {
          getInfo: sinon.stub().callsArg(0)
        }
      });
      auroracoind._tryAllClients(function(client, next) {
        client.getInfo(next);
      }, function(err) {
        if (err) {
          return done(err);
        }
        auroracoind.nodes[0].client.getInfo.callCount.should.equal(1);
        auroracoind.nodes[1].client.getInfo.callCount.should.equal(1);
        auroracoind.nodes[2].client.getInfo.callCount.should.equal(1);
        done();
      });
    });
    it('will start using the current node index (round-robin)', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.tryAllInterval = 1;
      auroracoind.nodes.push({
        client: {
          getInfo: sinon.stub().callsArgWith(0, new Error('2'))
        }
      });
      auroracoind.nodes.push({
        client: {
          getInfo: sinon.stub().callsArgWith(0, new Error('3'))
        }
      });
      auroracoind.nodes.push({
        client: {
          getInfo: sinon.stub().callsArgWith(0, new Error('1'))
        }
      });
      auroracoind.nodesIndex = 2;
      auroracoind._tryAllClients(function(client, next) {
        client.getInfo(next);
      }, function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('3');
        auroracoind.nodes[0].client.getInfo.callCount.should.equal(1);
        auroracoind.nodes[1].client.getInfo.callCount.should.equal(1);
        auroracoind.nodes[2].client.getInfo.callCount.should.equal(1);
        auroracoind.nodesIndex.should.equal(2);
        done();
      });
    });
    it('will get error if all clients fail', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.tryAllInterval = 1;
      auroracoind.nodes.push({
        client: {
          getInfo: sinon.stub().callsArgWith(0, new Error('test'))
        }
      });
      auroracoind.nodes.push({
        client: {
          getInfo: sinon.stub().callsArgWith(0, new Error('test'))
        }
      });
      auroracoind.nodes.push({
        client: {
          getInfo: sinon.stub().callsArgWith(0, new Error('test'))
        }
      });
      auroracoind._tryAllClients(function(client, next) {
        client.getInfo(next);
      }, function(err) {
        should.exist(err);
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        done();
      });
    });
  });

  describe('#_wrapRPCError', function() {
    it('will convert auroracoind-rpc error object into JavaScript error', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var error = auroracoind._wrapRPCError({message: 'Test error', code: -1});
      error.should.be.an.instanceof(errors.RPCError);
      error.code.should.equal(-1);
      error.message.should.equal('Test error');
    });
  });

  describe('#_initChain', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'info');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will set height and genesis buffer', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var genesisBuffer = new Buffer([]);
      auroracoind.getRawBlock = sinon.stub().callsArgWith(1, null, genesisBuffer);
      auroracoind.nodes.push({
        client: {
          getBestBlockHash: function(callback) {
            callback(null, {
              result: 'bestblockhash'
            });
          },
          getBlock: function(hash, callback) {
            if (hash === 'bestblockhash') {
              callback(null, {
                result: {
                  height: 5000
                }
              });
            }
          },
          getBlockHash: function(num, callback) {
            callback(null, {
              result: 'genesishash'
            });
          }
        }
      });
      auroracoind._initChain(function() {
        log.info.callCount.should.equal(1);
        auroracoind.getRawBlock.callCount.should.equal(1);
        auroracoind.getRawBlock.args[0][0].should.equal('genesishash');
        auroracoind.height.should.equal(5000);
        auroracoind.genesisBuffer.should.equal(genesisBuffer);
        done();
      });
    });
    it('it will handle error from getBestBlockHash', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, {code: -1, message: 'error'});
      auroracoind.nodes.push({
        client: {
          getBestBlockHash: getBestBlockHash
        }
      });
      auroracoind._initChain(function(err) {
        err.should.be.instanceOf(Error);
        done();
      });
    });
    it('it will handle error from getBlock', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, null, {});
      var getBlock = sinon.stub().callsArgWith(1, {code: -1, message: 'error'});
      auroracoind.nodes.push({
        client: {
          getBestBlockHash: getBestBlockHash,
          getBlock: getBlock
        }
      });
      auroracoind._initChain(function(err) {
        err.should.be.instanceOf(Error);
        done();
      });
    });
    it('it will handle error from getBlockHash', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, null, {});
      var getBlock = sinon.stub().callsArgWith(1, null, {
        result: {
          height: 10
        }
      });
      var getBlockHash = sinon.stub().callsArgWith(1, {code: -1, message: 'error'});
      auroracoind.nodes.push({
        client: {
          getBestBlockHash: getBestBlockHash,
          getBlock: getBlock,
          getBlockHash: getBlockHash
        }
      });
      auroracoind._initChain(function(err) {
        err.should.be.instanceOf(Error);
        done();
      });
    });
    it('it will handle error from getRawBlock', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, null, {});
      var getBlock = sinon.stub().callsArgWith(1, null, {
        result: {
          height: 10
        }
      });
      var getBlockHash = sinon.stub().callsArgWith(1, null, {});
      auroracoind.nodes.push({
        client: {
          getBestBlockHash: getBestBlockHash,
          getBlock: getBlock,
          getBlockHash: getBlockHash
        }
      });
      auroracoind.getRawBlock = sinon.stub().callsArgWith(1, new Error('test'));
      auroracoind._initChain(function(err) {
        err.should.be.instanceOf(Error);
        done();
      });
    });
  });

  describe('#_getDefaultConf', function() {
    afterEach(function() {
      bitcore.Networks.disableRegtest();
      baseConfig.node.network = bitcore.Networks.testnet;
    });
    it('will get default rpc port for livenet', function() {
      var config = {
        node: {
          network: bitcore.Networks.livenet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var auroracoind = new AuroracoinService(config);
      auroracoind._getDefaultConf().rpcport.should.equal(9332);
    });
    it('will get default rpc port for testnet', function() {
      var config = {
        node: {
          network: bitcore.Networks.testnet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var auroracoind = new AuroracoinService(config);
      auroracoind._getDefaultConf().rpcport.should.equal(19332);
    });
    it('will get default rpc port for regtest', function() {
      bitcore.Networks.enableRegtest();
      var config = {
        node: {
          network: bitcore.Networks.testnet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var auroracoind = new AuroracoinService(config);
      auroracoind._getDefaultConf().rpcport.should.equal(19332);
    });
  });

  describe('#_getNetworkConfigPath', function() {
    afterEach(function() {
      bitcore.Networks.disableRegtest();
      baseConfig.node.network = bitcore.Networks.testnet;
    });
    it('will get default config path for livenet', function() {
      var config = {
        node: {
          network: bitcore.Networks.livenet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var auroracoind = new AuroracoinService(config);
      should.equal(auroracoind._getNetworkConfigPath(), undefined);
    });
    it('will get default rpc port for testnet', function() {
      var config = {
        node: {
          network: bitcore.Networks.testnet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var auroracoind = new AuroracoinService(config);
      auroracoind._getNetworkConfigPath().should.equal('testnet3/auroracoin.conf');
    });
    it('will get default rpc port for regtest', function() {
      bitcore.Networks.enableRegtest();
      var config = {
        node: {
          network: bitcore.Networks.testnet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var auroracoind = new AuroracoinService(config);
      auroracoind._getNetworkConfigPath().should.equal('regtest/auroracoin.conf');
    });
  });

  describe('#_getNetworkOption', function() {
    afterEach(function() {
      bitcore.Networks.disableRegtest();
      baseConfig.node.network = bitcore.Networks.testnet;
    });
    it('return --testnet for testnet', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.node.network = bitcore.Networks.testnet;
      auroracoind._getNetworkOption().should.equal('--testnet');
    });
    it('return --regtest for testnet', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.node.network = bitcore.Networks.testnet;
      bitcore.Networks.enableRegtest();
      auroracoind._getNetworkOption().should.equal('--regtest');
    });
    it('return undefined for livenet', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.node.network = bitcore.Networks.livenet;
      bitcore.Networks.enableRegtest();
      should.equal(auroracoind._getNetworkOption(), undefined);
    });
  });

  describe('#_zmqBlockHandler', function() {
    it('will emit block', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var node = {};
      var message = new Buffer('00000000002e08fc7ae9a9aa5380e95e2adcdc5752a4a66a7d3a22466bd4e6aa', 'hex');
      auroracoind._rapidProtectedUpdateTip = sinon.stub();
      auroracoind.on('block', function(block) {
        block.should.equal(message);
        done();
      });
      auroracoind._zmqBlockHandler(node, message);
    });
    it('will not emit same block twice', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var node = {};
      var message = new Buffer('00000000002e08fc7ae9a9aa5380e95e2adcdc5752a4a66a7d3a22466bd4e6aa', 'hex');
      auroracoind._rapidProtectedUpdateTip = sinon.stub();
      auroracoind.on('block', function(block) {
        block.should.equal(message);
        done();
      });
      auroracoind._zmqBlockHandler(node, message);
      auroracoind._zmqBlockHandler(node, message);
    });
    it('will call function to update tip', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var node = {};
      var message = new Buffer('00000000002e08fc7ae9a9aa5380e95e2adcdc5752a4a66a7d3a22466bd4e6aa', 'hex');
      auroracoind._rapidProtectedUpdateTip = sinon.stub();
      auroracoind._zmqBlockHandler(node, message);
      auroracoind._rapidProtectedUpdateTip.callCount.should.equal(1);
      auroracoind._rapidProtectedUpdateTip.args[0][0].should.equal(node);
      auroracoind._rapidProtectedUpdateTip.args[0][1].should.equal(message);
    });
    it('will emit to subscribers', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var node = {};
      var message = new Buffer('00000000002e08fc7ae9a9aa5380e95e2adcdc5752a4a66a7d3a22466bd4e6aa', 'hex');
      auroracoind._rapidProtectedUpdateTip = sinon.stub();
      var emitter = new EventEmitter();
      auroracoind.subscriptions.hashblock.push(emitter);
      emitter.on('auroracoind/hashblock', function(blockHash) {
        blockHash.should.equal(message.toString('hex'));
        done();
      });
      auroracoind._zmqBlockHandler(node, message);
    });
  });

  describe('#_rapidProtectedUpdateTip', function() {
    it('will limit tip updates with rapid calls', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var callCount = 0;
      auroracoind._updateTip = function() {
        callCount++;
        callCount.should.be.within(1, 2);
        if (callCount > 1) {
          done();
        }
      };
      var node = {};
      var message = new Buffer('00000000002e08fc7ae9a9aa5380e95e2adcdc5752a4a66a7d3a22466bd4e6aa', 'hex');
      var count = 0;
      function repeat() {
        auroracoind._rapidProtectedUpdateTip(node, message);
        count++;
        if (count < 50) {
          repeat();
        }
      }
      repeat();
    });
  });

  describe('#_updateTip', function() {
    var sandbox = sinon.sandbox.create();
    var message = new Buffer('00000000002e08fc7ae9a9aa5380e95e2adcdc5752a4a66a7d3a22466bd4e6aa', 'hex');
    beforeEach(function() {
      sandbox.stub(log, 'error');
      sandbox.stub(log, 'info');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('log and emit rpc error from get block', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.syncPercentage = sinon.stub();
      auroracoind.on('error', function(err) {
        err.code.should.equal(-1);
        err.message.should.equal('Test error');
        log.error.callCount.should.equal(1);
        done();
      });
      var node = {
        client: {
          getBlock: sinon.stub().callsArgWith(1, {message: 'Test error', code: -1})
        }
      };
      auroracoind._updateTip(node, message);
    });
    it('emit synced if percentage is 100', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.syncPercentage = sinon.stub().callsArgWith(0, null, 100);
      auroracoind.on('synced', function() {
        done();
      });
      var node = {
        client: {
          getBlock: sinon.stub()
        }
      };
      auroracoind._updateTip(node, message);
    });
    it('NOT emit synced if percentage is less than 100', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.syncPercentage = sinon.stub().callsArgWith(0, null, 99);
      auroracoind.on('synced', function() {
        throw new Error('Synced called');
      });
      var node = {
        client: {
          getBlock: sinon.stub()
        }
      };
      auroracoind._updateTip(node, message);
      log.info.callCount.should.equal(1);
      done();
    });
    it('log and emit error from syncPercentage', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.syncPercentage = sinon.stub().callsArgWith(0, new Error('test'));
      auroracoind.on('error', function(err) {
        log.error.callCount.should.equal(1);
        err.message.should.equal('test');
        done();
      });
      var node = {
        client: {
          getBlock: sinon.stub()
        }
      };
      auroracoind._updateTip(node, message);
    });
    it('reset caches and set height', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.syncPercentage = sinon.stub();
      auroracoind._resetCaches = sinon.stub();
      auroracoind.on('tip', function(height) {
        auroracoind._resetCaches.callCount.should.equal(1);
        height.should.equal(10);
        auroracoind.height.should.equal(10);
        done();
      });
      var node = {
        client: {
          getBlock: sinon.stub().callsArgWith(1, null, {
            result: {
              height: 10
            }
          })
        }
      };
      auroracoind._updateTip(node, message);
    });
    it('will NOT update twice for the same hash', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.syncPercentage = sinon.stub();
      auroracoind._resetCaches = sinon.stub();
      auroracoind.on('tip', function() {
        done();
      });
      var node = {
        client: {
          getBlock: sinon.stub().callsArgWith(1, null, {
            result: {
              height: 10
            }
          })
        }
      };
      auroracoind._updateTip(node, message);
      auroracoind._updateTip(node, message);
    });
    it('will not call syncPercentage if node is stopping', function(done) {
      var config = {
        node: {
          network: bitcore.Networks.testnet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var auroracoind = new AuroracoinService(config);
      auroracoind.syncPercentage = sinon.stub();
      auroracoind._resetCaches = sinon.stub();
      auroracoind.node.stopping = true;
      var node = {
        client: {
          getBlock: sinon.stub().callsArgWith(1, null, {
            result: {
              height: 10
            }
          })
        }
      };
      auroracoind.on('tip', function() {
        auroracoind.syncPercentage.callCount.should.equal(0);
        done();
      });
      auroracoind._updateTip(node, message);
    });
  });

  describe('#_getAddressesFromTransaction', function() {
    it('will get results using bitcore.Transaction', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var wif = 'T872No3VhULcqFF6Sv1PSCRXZKVBPYWG2UtG4ECFK7nzaUUU8Kuj';
      var privkey = bitcore.PrivateKey.fromWIF(wif);
      var inputAddress = privkey.toAddress(bitcore.Networks.testnet);
      var outputAddress = bitcore.Address('2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br');
      var tx = bitcore.Transaction();
      tx.from({
        txid: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
        outputIndex: 0,
        script: bitcore.Script(inputAddress),
        address: inputAddress.toString(),
        satoshis: 5000000000
      });
      tx.to(outputAddress, 5000000000);
      tx.sign(privkey);
      var addresses = auroracoind._getAddressesFromTransaction(tx);
      addresses.length.should.equal(2);
      addresses[0].should.equal(inputAddress.toString());
      addresses[1].should.equal(outputAddress.toString());
    });
    it('will handle non-standard script types', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var tx = bitcore.Transaction();
      tx.addInput(bitcore.Transaction.Input({
        prevTxId: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
        script: bitcore.Script('OP_TRUE'),
        outputIndex: 1,
        output: {
          script: bitcore.Script('OP_TRUE'),
          satoshis: 5000000000
        }
      }));
      tx.addOutput(bitcore.Transaction.Output({
        script: bitcore.Script('OP_TRUE'),
        satoshis: 5000000000
      }));
      var addresses = auroracoind._getAddressesFromTransaction(tx);
      addresses.length.should.equal(0);
    });
    it('will handle unparsable script types or missing input script', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var tx = bitcore.Transaction();
      tx.addOutput(bitcore.Transaction.Output({
        script: new Buffer('4c', 'hex'),
        satoshis: 5000000000
      }));
      var addresses = auroracoind._getAddressesFromTransaction(tx);
      addresses.length.should.equal(0);
    });
    it('will return unique values', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var tx = bitcore.Transaction();
      var address = bitcore.Address('2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br');
      tx.addOutput(bitcore.Transaction.Output({
        script: bitcore.Script(address),
        satoshis: 5000000000
      }));
      tx.addOutput(bitcore.Transaction.Output({
        script: bitcore.Script(address),
        satoshis: 5000000000
      }));
      var addresses = auroracoind._getAddressesFromTransaction(tx);
      addresses.length.should.equal(1);
    });
  });

  describe('#_notifyAddressTxidSubscribers', function() {
    it('will emit event if matching addresses', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind._getAddressesFromTransaction = sinon.stub().returns([address]);
      var emitter = new EventEmitter();
      auroracoind.subscriptions.address[address] = [emitter];
      var txid = '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0';
      var transaction = {};
      emitter.on('auroracoind/addresstxid', function(data) {
        data.address.should.equal(address);
        data.txid.should.equal(txid);
        done();
      });
      sinon.spy(emitter, 'emit');
      auroracoind._notifyAddressTxidSubscribers(txid, transaction);
      emitter.emit.callCount.should.equal(1);
    });
    it('will NOT emit event without matching addresses', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind._getAddressesFromTransaction = sinon.stub().returns([address]);
      var emitter = new EventEmitter();
      var txid = '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0';
      var transaction = {};
      emitter.emit = sinon.stub();
      auroracoind._notifyAddressTxidSubscribers(txid, transaction);
      emitter.emit.callCount.should.equal(0);
    });
  });

  describe('#_zmqTransactionHandler', function() {
    it('will emit to subscribers', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var expectedBuffer = new Buffer(txhex, 'hex');
      var emitter = new EventEmitter();
      auroracoind.subscriptions.rawtransaction.push(emitter);
      emitter.on('auroracoind/rawtransaction', function(hex) {
        hex.should.be.a('string');
        hex.should.equal(expectedBuffer.toString('hex'));
        done();
      });
      var node = {};
      auroracoind._zmqTransactionHandler(node, expectedBuffer);
    });
    it('will NOT emit to subscribers more than once for the same tx', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var expectedBuffer = new Buffer(txhex, 'hex');
      var emitter = new EventEmitter();
      auroracoind.subscriptions.rawtransaction.push(emitter);
      emitter.on('auroracoind/rawtransaction', function() {
        done();
      });
      var node = {};
      auroracoind._zmqTransactionHandler(node, expectedBuffer);
      auroracoind._zmqTransactionHandler(node, expectedBuffer);
    });
    it('will emit "tx" event', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var expectedBuffer = new Buffer(txhex, 'hex');
      auroracoind.on('tx', function(buffer) {
        buffer.should.be.instanceof(Buffer);
        buffer.toString('hex').should.equal(expectedBuffer.toString('hex'));
        done();
      });
      var node = {};
      auroracoind._zmqTransactionHandler(node, expectedBuffer);
    });
    it('will NOT emit "tx" event more than once for the same tx', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var expectedBuffer = new Buffer(txhex, 'hex');
      auroracoind.on('tx', function() {
        done();
      });
      var node = {};
      auroracoind._zmqTransactionHandler(node, expectedBuffer);
      auroracoind._zmqTransactionHandler(node, expectedBuffer);
    });
  });

  describe('#_checkSyncedAndSubscribeZmqEvents', function() {
    var sandbox = sinon.sandbox.create();
    before(function() {
      sandbox.stub(log, 'error');
    });
    after(function() {
      sandbox.restore();
    });
    it('log errors, update tip and subscribe to zmq events', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind._updateTip = sinon.stub();
      auroracoind._subscribeZmqEvents = sinon.stub();
      var blockEvents = 0;
      auroracoind.on('block', function() {
        blockEvents++;
      });
      var getBestBlockHash = sinon.stub().callsArgWith(0, null, {
        result: '00000000000000001bb82a7f5973618cfd3185ba1ded04dd852a653f92a27c45'
      });
      getBestBlockHash.onCall(0).callsArgWith(0, {code: -1 , message: 'Test error'});
      var progress = 0.90;
      function getProgress() {
        progress = progress + 0.01;
        return progress;
      }
      var info = {};
      Object.defineProperty(info, 'result', {
        get: function() {
          return {
            verificationprogress: getProgress()
          };
        }
      });
      var getBlockchainInfo = sinon.stub().callsArgWith(0, null, info);
      getBlockchainInfo.onCall(0).callsArgWith(0, {code: -1, message: 'Test error'});
      var node = {
        _reindex: true,
        _reindexWait: 1,
        _tipUpdateInterval: 1,
        client: {
          getBestBlockHash: getBestBlockHash,
          getBlockchainInfo: getBlockchainInfo
        }
      };
      auroracoind._checkSyncedAndSubscribeZmqEvents(node);
      setTimeout(function() {
        log.error.callCount.should.equal(2);
        blockEvents.should.equal(11);
        auroracoind._updateTip.callCount.should.equal(11);
        auroracoind._subscribeZmqEvents.callCount.should.equal(1);
        done();
      }, 200);
    });
    it('it will clear interval if node is stopping', function(done) {
      var config = {
        node: {
          network: bitcore.Networks.testnet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var auroracoind = new AuroracoinService(config);
      var getBestBlockHash = sinon.stub().callsArgWith(0, {code: -1, message: 'error'});
      var node = {
        _tipUpdateInterval: 1,
        client: {
          getBestBlockHash: getBestBlockHash
        }
      };
      auroracoind._checkSyncedAndSubscribeZmqEvents(node);
      setTimeout(function() {
        auroracoind.node.stopping = true;
        var count = getBestBlockHash.callCount;
        setTimeout(function() {
          getBestBlockHash.callCount.should.equal(count);
          done();
        }, 100);
      }, 100);
    });
    it('will not set interval if synced is true', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind._updateTip = sinon.stub();
      auroracoind._subscribeZmqEvents = sinon.stub();
      var getBestBlockHash = sinon.stub().callsArgWith(0, null, {
        result: '00000000000000001bb82a7f5973618cfd3185ba1ded04dd852a653f92a27c45'
      });
      var info = {
        result: {
          verificationprogress: 1.00
        }
      };
      var getBlockchainInfo = sinon.stub().callsArgWith(0, null, info);
      var node = {
        _tipUpdateInterval: 1,
        client: {
          getBestBlockHash: getBestBlockHash,
          getBlockchainInfo: getBlockchainInfo
        }
      };
      auroracoind._checkSyncedAndSubscribeZmqEvents(node);
      setTimeout(function() {
        getBestBlockHash.callCount.should.equal(1);
        getBlockchainInfo.callCount.should.equal(1);
        done();
      }, 200);
    });
  });

  describe('#_subscribeZmqEvents', function() {
    it('will call subscribe on zmq socket', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var node = {
        zmqSubSocket: {
          subscribe: sinon.stub(),
          on: sinon.stub()
        }
      };
      auroracoind._subscribeZmqEvents(node);
      node.zmqSubSocket.subscribe.callCount.should.equal(2);
      node.zmqSubSocket.subscribe.args[0][0].should.equal('hashblock');
      node.zmqSubSocket.subscribe.args[1][0].should.equal('rawtx');
    });
    it('will call relevant handler for rawtx topics', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind._zmqTransactionHandler = sinon.stub();
      var node = {
        zmqSubSocket: new EventEmitter()
      };
      node.zmqSubSocket.subscribe = sinon.stub();
      auroracoind._subscribeZmqEvents(node);
      node.zmqSubSocket.on('message', function() {
        auroracoind._zmqTransactionHandler.callCount.should.equal(1);
        done();
      });
      var topic = new Buffer('rawtx', 'utf8');
      var message = new Buffer('abcdef', 'hex');
      node.zmqSubSocket.emit('message', topic, message);
    });
    it('will call relevant handler for hashblock topics', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind._zmqBlockHandler = sinon.stub();
      var node = {
        zmqSubSocket: new EventEmitter()
      };
      node.zmqSubSocket.subscribe = sinon.stub();
      auroracoind._subscribeZmqEvents(node);
      node.zmqSubSocket.on('message', function() {
        auroracoind._zmqBlockHandler.callCount.should.equal(1);
        done();
      });
      var topic = new Buffer('hashblock', 'utf8');
      var message = new Buffer('abcdef', 'hex');
      node.zmqSubSocket.emit('message', topic, message);
    });
    it('will ignore unknown topic types', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind._zmqBlockHandler = sinon.stub();
      auroracoind._zmqTransactionHandler = sinon.stub();
      var node = {
        zmqSubSocket: new EventEmitter()
      };
      node.zmqSubSocket.subscribe = sinon.stub();
      auroracoind._subscribeZmqEvents(node);
      node.zmqSubSocket.on('message', function() {
        auroracoind._zmqBlockHandler.callCount.should.equal(0);
        auroracoind._zmqTransactionHandler.callCount.should.equal(0);
        done();
      });
      var topic = new Buffer('unknown', 'utf8');
      var message = new Buffer('abcdef', 'hex');
      node.zmqSubSocket.emit('message', topic, message);
    });
  });

  describe('#_initZmqSubSocket', function() {
    it('will setup zmq socket', function() {
      var socket = new EventEmitter();
      socket.monitor = sinon.stub();
      socket.connect = sinon.stub();
      var socketFunc = function() {
        return socket;
      };
      var AuroracoinService = proxyquire('../../lib/services/auroracoind', {
        'zeromq': {
          socket: socketFunc
        }
      });
      var auroracoind = new AuroracoinService(baseConfig);
      var node = {};
      auroracoind._initZmqSubSocket(node, 'url');
      node.zmqSubSocket.should.equal(socket);
      socket.connect.callCount.should.equal(1);
      socket.connect.args[0][0].should.equal('url');
      socket.monitor.callCount.should.equal(1);
      socket.monitor.args[0][0].should.equal(500);
      socket.monitor.args[0][1].should.equal(0);
    });
  });

  describe('#_checkReindex', function() {
    var sandbox = sinon.sandbox.create();
    before(function() {
      sandbox.stub(log, 'info');
    });
    after(function() {
      sandbox.restore();
    });
    it('give error from client getblockchaininfo', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var node = {
        _reindex: true,
        _reindexWait: 1,
        client: {
          getBlockchainInfo: sinon.stub().callsArgWith(0, {code: -1 , message: 'Test error'})
        }
      };
      auroracoind._checkReindex(node, function(err) {
        should.exist(err);
        err.should.be.instanceof(errors.RPCError);
        done();
      });
    });
    it('will wait until sync is 100 percent', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var percent = 0.89;
      var node = {
        _reindex: true,
        _reindexWait: 1,
        client: {
          getBlockchainInfo: function(callback) {
            percent += 0.01;
            callback(null, {
              result: {
                verificationprogress: percent
              }
            });
          }
        }
      };
      auroracoind._checkReindex(node, function() {
        node._reindex.should.equal(false);
        log.info.callCount.should.equal(11);
        done();
      });
    });
    it('will call callback if reindex is not enabled', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var node = {
        _reindex: false
      };
      auroracoind._checkReindex(node, function() {
        node._reindex.should.equal(false);
        done();
      });
    });
  });

  describe('#_loadTipFromNode', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'warn');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will give rpc from client getbestblockhash', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, {code: -1, message: 'Test error'});
      var node = {
        client: {
          getBestBlockHash: getBestBlockHash
        }
      };
      auroracoind._loadTipFromNode(node, function(err) {
        err.should.be.instanceof(Error);
        log.warn.callCount.should.equal(0);
        done();
      });
    });
    it('will give rpc from client getblock', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, null, {
        result: '00000000000000001bb82a7f5973618cfd3185ba1ded04dd852a653f92a27c45'
      });
      var getBlock = sinon.stub().callsArgWith(1, new Error('Test error'));
      var node = {
        client: {
          getBestBlockHash: getBestBlockHash,
          getBlock: getBlock
        }
      };
      auroracoind._loadTipFromNode(node, function(err) {
        getBlock.args[0][0].should.equal('00000000000000001bb82a7f5973618cfd3185ba1ded04dd852a653f92a27c45');
        err.should.be.instanceof(Error);
        log.warn.callCount.should.equal(0);
        done();
      });
    });
    it('will log when error is RPC_IN_WARMUP', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, {code: -28, message: 'Verifying blocks...'});
      var node = {
        client: {
          getBestBlockHash: getBestBlockHash
        }
      };
      auroracoind._loadTipFromNode(node, function(err) {
        err.should.be.instanceof(Error);
        log.warn.callCount.should.equal(1);
        done();
      });
    });
    it('will set height and emit tip', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, null, {
        result: '00000000000000001bb82a7f5973618cfd3185ba1ded04dd852a653f92a27c45'
      });
      var getBlock = sinon.stub().callsArgWith(1, null, {
        result: {
          height: 100
        }
      });
      var node = {
        client: {
          getBestBlockHash: getBestBlockHash,
          getBlock: getBlock
        }
      };
      auroracoind.on('tip', function(height) {
        height.should.equal(100);
        auroracoind.height.should.equal(100);
        done();
      });
      auroracoind._loadTipFromNode(node, function(err) {
        if (err) {
          return done(err);
        }
      });
    });
  });

  describe('#_stopSpawnedProcess', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'warn');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('it will kill process and resume', function(done) {
      var readFile = sandbox.stub();
      readFile.onCall(0).callsArgWith(2, null, '4321');
      var error = new Error('Test error');
      error.code = 'ENOENT';
      readFile.onCall(1).callsArgWith(2, error);
      var TestAuroracoinService = proxyquire('../../lib/services/auroracoind', {
        fs: {
          readFile: readFile
        }
      });
      var auroracoind = new TestAuroracoinService(baseConfig);
      auroracoind.spawnStopTime = 1;
      auroracoind._process = {};
      auroracoind._process.kill = sinon.stub();
      auroracoind._stopSpawnedAuroracoin(function(err) {
        if (err) {
          return done(err);
        }
        auroracoind._process.kill.callCount.should.equal(1);
        log.warn.callCount.should.equal(1);
        done();
      });
    });
    it('it will attempt to kill process and resume', function(done) {
      var readFile = sandbox.stub();
      readFile.onCall(0).callsArgWith(2, null, '4321');
      var error = new Error('Test error');
      error.code = 'ENOENT';
      readFile.onCall(1).callsArgWith(2, error);
      var TestAuroracoinService = proxyquire('../../lib/services/auroracoind', {
        fs: {
          readFile: readFile
        }
      });
      var auroracoind = new TestAuroracoinService(baseConfig);
      auroracoind.spawnStopTime = 1;
      auroracoind._process = {};
      var error2 = new Error('Test error');
      error2.code = 'ESRCH';
      auroracoind._process.kill = sinon.stub().throws(error2);
      auroracoind._stopSpawnedAuroracoin(function(err) {
        if (err) {
          return done(err);
        }
        auroracoind._process.kill.callCount.should.equal(1);
        log.warn.callCount.should.equal(2);
        done();
      });
    });
    it('it will attempt to kill process with NaN', function(done) {
      var readFile = sandbox.stub();
      readFile.onCall(0).callsArgWith(2, null, '     ');
      var TestAuroracoinService = proxyquire('../../lib/services/auroracoind', {
        fs: {
          readFile: readFile
        }
      });
      var auroracoind = new TestAuroracoinService(baseConfig);
      auroracoind.spawnStopTime = 1;
      auroracoind._process = {};
      auroracoind._process.kill = sinon.stub();
      auroracoind._stopSpawnedAuroracoin(function(err) {
        if (err) {
          return done(err);
        }
        done();
      });
    });
    it('it will attempt to kill process without pid', function(done) {
      var readFile = sandbox.stub();
      readFile.onCall(0).callsArgWith(2, null, '');
      var TestAuroracoinService = proxyquire('../../lib/services/auroracoind', {
        fs: {
          readFile: readFile
        }
      });
      var auroracoind = new TestAuroracoinService(baseConfig);
      auroracoind.spawnStopTime = 1;
      auroracoind._process = {};
      auroracoind._process.kill = sinon.stub();
      auroracoind._stopSpawnedAuroracoin(function(err) {
        if (err) {
          return done(err);
        }
        done();
      });
    });
  });

  describe('#_spawnChildProcess', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'info');
      sandbox.stub(log, 'warn');
      sandbox.stub(log, 'error');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will give error from spawn config', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind._loadSpawnConfiguration = sinon.stub();
      auroracoind._loadSpawnConfiguration = sinon.stub().throws(new Error('test'));
      auroracoind._spawnChildProcess(function(err) {
        err.should.be.instanceof(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will give error from stopSpawnedAuroracoin', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind._loadSpawnConfiguration = sinon.stub();
      auroracoind._stopSpawnedAuroracoin = sinon.stub().callsArgWith(0, new Error('test'));
      auroracoind._spawnChildProcess(function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
      });
    });
    it('will exit spawn if shutdown', function() {
      var config = {
        node: {
          network: bitcore.Networks.testnet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var process = new EventEmitter();
      var spawn = sinon.stub().returns(process);
      var TestAuroracoinService = proxyquire('../../lib/services/auroracoind', {
        fs: {
          readFileSync: readFileSync
        },
        child_process: {
          spawn: spawn
        }
      });
      var auroracoind = new TestAuroracoinService(config);
      auroracoind.spawn = {};
      auroracoind._loadSpawnConfiguration = sinon.stub();
      auroracoind._stopSpawnedAuroracoin = sinon.stub().callsArgWith(0, null);
      auroracoind.node.stopping = true;
      auroracoind._spawnChildProcess(function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.match(/Stopping while trying to spawn/);
      });
    });
    it('will include network with spawn command and init zmq/rpc on node', function(done) {
      var process = new EventEmitter();
      var spawn = sinon.stub().returns(process);
      var TestAuroracoinService = proxyquire('../../lib/services/auroracoind', {
        fs: {
          readFileSync: readFileSync
        },
        child_process: {
          spawn: spawn
        }
      });
      var auroracoind = new TestAuroracoinService(baseConfig);

      auroracoind._loadSpawnConfiguration = sinon.stub();
      auroracoind.spawn = {};
      auroracoind.spawn.exec = 'testexec';
      auroracoind.spawn.configPath = 'testdir/auroracoin.conf';
      auroracoind.spawn.datadir = 'testdir';
      auroracoind.spawn.config = {};
      auroracoind.spawn.config.rpcport = 20001;
      auroracoind.spawn.config.rpcuser = 'auroracoin';
      auroracoind.spawn.config.rpcpassword = 'password';
      auroracoind.spawn.config.zmqpubrawtx = 'tcp://127.0.0.1:30001';

      auroracoind._loadTipFromNode = sinon.stub().callsArgWith(1, null);
      auroracoind._initZmqSubSocket = sinon.stub();
      auroracoind._checkSyncedAndSubscribeZmqEvents = sinon.stub();
      auroracoind._checkReindex = sinon.stub().callsArgWith(1, null);
      auroracoind._spawnChildProcess(function(err, node) {
        should.not.exist(err);
        spawn.callCount.should.equal(1);
        spawn.args[0][0].should.equal('testexec');
        spawn.args[0][1].should.deep.equal([
          '--conf=testdir/auroracoin.conf',
          '--datadir=testdir',
          '--testnet'
        ]);
        spawn.args[0][2].should.deep.equal({
          stdio: 'inherit'
        });
        auroracoind._loadTipFromNode.callCount.should.equal(1);
        auroracoind._initZmqSubSocket.callCount.should.equal(1);
        should.exist(auroracoind._initZmqSubSocket.args[0][0].client);
        auroracoind._initZmqSubSocket.args[0][1].should.equal('tcp://127.0.0.1:30001');
        auroracoind._checkSyncedAndSubscribeZmqEvents.callCount.should.equal(1);
        should.exist(auroracoind._checkSyncedAndSubscribeZmqEvents.args[0][0].client);
        should.exist(node);
        should.exist(node.client);
        done();
      });
    });
    it('will respawn auroracoind spawned process', function(done) {
      var process = new EventEmitter();
      var spawn = sinon.stub().returns(process);
      var TestAuroracoinService = proxyquire('../../lib/services/auroracoind', {
        fs: {
          readFileSync: readFileSync
        },
        child_process: {
          spawn: spawn
        }
      });
      var auroracoind = new TestAuroracoinService(baseConfig);
      auroracoind._loadSpawnConfiguration = sinon.stub();
      auroracoind.spawn = {};
      auroracoind.spawn.exec = 'auroracoind';
      auroracoind.spawn.datadir = '/tmp/auroracoin';
      auroracoind.spawn.configPath = '/tmp/auroracoin/auroracoin.conf';
      auroracoind.spawn.config = {};
      auroracoind.spawnRestartTime = 1;
      auroracoind._loadTipFromNode = sinon.stub().callsArg(1);
      auroracoind._initZmqSubSocket = sinon.stub();
      auroracoind._checkReindex = sinon.stub().callsArg(1);
      auroracoind._checkSyncedAndSubscribeZmqEvents = sinon.stub();
      auroracoind._stopSpawnedAuroracoin = sinon.stub().callsArg(0);
      sinon.spy(auroracoind, '_spawnChildProcess');
      auroracoind._spawnChildProcess(function(err) {
        if (err) {
          return done(err);
        }
        process.once('exit', function() {
          setTimeout(function() {
            auroracoind._spawnChildProcess.callCount.should.equal(2);
            done();
          }, 5);
        });
        process.emit('exit', 1);
      });
    });
    it('will emit error during respawn', function(done) {
      var process = new EventEmitter();
      var spawn = sinon.stub().returns(process);
      var TestAuroracoinService = proxyquire('../../lib/services/auroracoind', {
        fs: {
          readFileSync: readFileSync
        },
        child_process: {
          spawn: spawn
        }
      });
      var auroracoind = new TestAuroracoinService(baseConfig);
      auroracoind._loadSpawnConfiguration = sinon.stub();
      auroracoind.spawn = {};
      auroracoind.spawn.exec = 'auroracoind';
      auroracoind.spawn.datadir = '/tmp/auroracoin';
      auroracoind.spawn.configPath = '/tmp/auroracoin/auroracoin.conf';
      auroracoind.spawn.config = {};
      auroracoind.spawnRestartTime = 1;
      auroracoind._loadTipFromNode = sinon.stub().callsArg(1);
      auroracoind._initZmqSubSocket = sinon.stub();
      auroracoind._checkReindex = sinon.stub().callsArg(1);
      auroracoind._checkSyncedAndSubscribeZmqEvents = sinon.stub();
      auroracoind._stopSpawnedAuroracoin = sinon.stub().callsArg(0);
      sinon.spy(auroracoind, '_spawnChildProcess');
      auroracoind._spawnChildProcess(function(err) {
        if (err) {
          return done(err);
        }
        auroracoind._spawnChildProcess = sinon.stub().callsArgWith(0, new Error('test'));
        auroracoind.on('error', function(err) {
          err.should.be.instanceOf(Error);
          err.message.should.equal('test');
          done();
        });
        process.emit('exit', 1);
      });
    });
    it('will NOT respawn auroracoind spawned process if shutting down', function(done) {
      var process = new EventEmitter();
      var spawn = sinon.stub().returns(process);
      var TestAuroracoinService = proxyquire('../../lib/services/auroracoind', {
        fs: {
          readFileSync: readFileSync
        },
        child_process: {
          spawn: spawn
        }
      });
      var config = {
        node: {
          network: bitcore.Networks.testnet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var auroracoind = new TestAuroracoinService(config);
      auroracoind._loadSpawnConfiguration = sinon.stub();
      auroracoind.spawn = {};
      auroracoind.spawn.exec = 'auroracoind';
      auroracoind.spawn.datadir = '/tmp/auroracoin';
      auroracoind.spawn.configPath = '/tmp/auroracoin/auroracoin.conf';
      auroracoind.spawn.config = {};
      auroracoind.spawnRestartTime = 1;
      auroracoind._loadTipFromNode = sinon.stub().callsArg(1);
      auroracoind._initZmqSubSocket = sinon.stub();
      auroracoind._checkReindex = sinon.stub().callsArg(1);
      auroracoind._checkSyncedAndSubscribeZmqEvents = sinon.stub();
      auroracoind._stopSpawnedAuroracoin = sinon.stub().callsArg(0);
      sinon.spy(auroracoind, '_spawnChildProcess');
      auroracoind._spawnChildProcess(function(err) {
        if (err) {
          return done(err);
        }
        auroracoind.node.stopping = true;
        process.once('exit', function() {
          setTimeout(function() {
            auroracoind._spawnChildProcess.callCount.should.equal(1);
            done();
          }, 5);
        });
        process.emit('exit', 1);
      });
    });
    it('will give error after 60 retries', function(done) {
      var process = new EventEmitter();
      var spawn = sinon.stub().returns(process);
      var TestAuroracoinService = proxyquire('../../lib/services/auroracoind', {
        fs: {
          readFileSync: readFileSync
        },
        child_process: {
          spawn: spawn
        }
      });
      var auroracoind = new TestAuroracoinService(baseConfig);
      auroracoind.startRetryInterval = 1;
      auroracoind._loadSpawnConfiguration = sinon.stub();
      auroracoind.spawn = {};
      auroracoind.spawn.exec = 'testexec';
      auroracoind.spawn.configPath = 'testdir/auroracoin.conf';
      auroracoind.spawn.datadir = 'testdir';
      auroracoind.spawn.config = {};
      auroracoind.spawn.config.rpcport = 20001;
      auroracoind.spawn.config.rpcuser = 'auroracoin';
      auroracoind.spawn.config.rpcpassword = 'password';
      auroracoind.spawn.config.zmqpubrawtx = 'tcp://127.0.0.1:30001';
      auroracoind._loadTipFromNode = sinon.stub().callsArgWith(1, new Error('test'));
      auroracoind._spawnChildProcess(function(err) {
        auroracoind._loadTipFromNode.callCount.should.equal(60);
        err.should.be.instanceof(Error);
        done();
      });
    });
    it('will give error from check reindex', function(done) {
      var process = new EventEmitter();
      var spawn = sinon.stub().returns(process);
      var TestAuroracoinService = proxyquire('../../lib/services/auroracoind', {
        fs: {
          readFileSync: readFileSync
        },
        child_process: {
          spawn: spawn
        }
      });
      var auroracoind = new TestAuroracoinService(baseConfig);

      auroracoind._loadSpawnConfiguration = sinon.stub();
      auroracoind.spawn = {};
      auroracoind.spawn.exec = 'testexec';
      auroracoind.spawn.configPath = 'testdir/auroracoin.conf';
      auroracoind.spawn.datadir = 'testdir';
      auroracoind.spawn.config = {};
      auroracoind.spawn.config.rpcport = 20001;
      auroracoind.spawn.config.rpcuser = 'auroracoin';
      auroracoind.spawn.config.rpcpassword = 'password';
      auroracoind.spawn.config.zmqpubrawtx = 'tcp://127.0.0.1:30001';

      auroracoind._loadTipFromNode = sinon.stub().callsArgWith(1, null);
      auroracoind._initZmqSubSocket = sinon.stub();
      auroracoind._checkSyncedAndSubscribeZmqEvents = sinon.stub();
      auroracoind._checkReindex = sinon.stub().callsArgWith(1, new Error('test'));

      auroracoind._spawnChildProcess(function(err) {
        err.should.be.instanceof(Error);
        done();
      });
    });
  });

  describe('#_connectProcess', function() {
    it('will give error if connecting while shutting down', function(done) {
      var config = {
        node: {
          network: bitcore.Networks.testnet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var auroracoind = new AuroracoinService(config);
      auroracoind.node.stopping = true;
      auroracoind.startRetryInterval = 100;
      auroracoind._loadTipFromNode = sinon.stub();
      auroracoind._connectProcess({}, function(err) {
        err.should.be.instanceof(Error);
        err.message.should.match(/Stopping while trying to connect/);
        auroracoind._loadTipFromNode.callCount.should.equal(0);
        done();
      });
    });
    it('will give error from loadTipFromNode after 60 retries', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind._loadTipFromNode = sinon.stub().callsArgWith(1, new Error('test'));
      auroracoind.startRetryInterval = 1;
      var config = {};
      auroracoind._connectProcess(config, function(err) {
        err.should.be.instanceof(Error);
        auroracoind._loadTipFromNode.callCount.should.equal(60);
        done();
      });
    });
    it('will init zmq/rpc on node', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind._initZmqSubSocket = sinon.stub();
      auroracoind._subscribeZmqEvents = sinon.stub();
      auroracoind._loadTipFromNode = sinon.stub().callsArgWith(1, null);
      var config = {};
      auroracoind._connectProcess(config, function(err, node) {
        should.not.exist(err);
        auroracoind._loadTipFromNode.callCount.should.equal(1);
        auroracoind._initZmqSubSocket.callCount.should.equal(1);
        auroracoind._loadTipFromNode.callCount.should.equal(1);
        should.exist(node);
        should.exist(node.client);
        done();
      });
    });
  });

  describe('#start', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'info');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will give error if "spawn" and "connect" are both not configured', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.options = {};
      auroracoind.start(function(err) {
        err.should.be.instanceof(Error);
        err.message.should.match(/Auroracoin configuration options/);
      });
      done();
    });
    it('will give error from spawnChildProcess', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind._spawnChildProcess = sinon.stub().callsArgWith(0, new Error('test'));
      auroracoind.options = {
        spawn: {}
      };
      auroracoind.start(function(err) {
        err.should.be.instanceof(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will give error from connectProcess', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind._connectProcess = sinon.stub().callsArgWith(1, new Error('test'));
      auroracoind.options = {
        connect: [
          {}
        ]
      };
      auroracoind.start(function(err) {
        auroracoind._connectProcess.callCount.should.equal(1);
        err.should.be.instanceof(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will push node from spawnChildProcess', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var node = {};
      auroracoind._initChain = sinon.stub().callsArg(0);
      auroracoind._spawnChildProcess = sinon.stub().callsArgWith(0, null, node);
      auroracoind.options = {
        spawn: {}
      };
      auroracoind.start(function(err) {
        should.not.exist(err);
        auroracoind.nodes.length.should.equal(1);
        done();
      });
    });
    it('will push node from connectProcess', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind._initChain = sinon.stub().callsArg(0);
      var nodes = [{}];
      auroracoind._connectProcess = sinon.stub().callsArgWith(1, null, nodes);
      auroracoind.options = {
        connect: [
          {}
        ]
      };
      auroracoind.start(function(err) {
        should.not.exist(err);
        auroracoind._connectProcess.callCount.should.equal(1);
        auroracoind.nodes.length.should.equal(1);
        done();
      });
    });
  });

  describe('#isSynced', function() {
    it('will give error from syncPercentage', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.syncPercentage = sinon.stub().callsArgWith(0, new Error('test'));
      auroracoind.isSynced(function(err) {
        should.exist(err);
        err.message.should.equal('test');
        done();
      });
    });
    it('will give "true" if percentage is 100.00', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.syncPercentage = sinon.stub().callsArgWith(0, null, 100.00);
      auroracoind.isSynced(function(err, synced) {
        if (err) {
          return done(err);
        }
        synced.should.equal(true);
        done();
      });
    });
    it('will give "true" if percentage is 99.98', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.syncPercentage = sinon.stub().callsArgWith(0, null, 99.98);
      auroracoind.isSynced(function(err, synced) {
        if (err) {
          return done(err);
        }
        synced.should.equal(true);
        done();
      });
    });
    it('will give "false" if percentage is 99.49', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.syncPercentage = sinon.stub().callsArgWith(0, null, 99.49);
      auroracoind.isSynced(function(err, synced) {
        if (err) {
          return done(err);
        }
        synced.should.equal(false);
        done();
      });
    });
    it('will give "false" if percentage is 1', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.syncPercentage = sinon.stub().callsArgWith(0, null, 1);
      auroracoind.isSynced(function(err, synced) {
        if (err) {
          return done(err);
        }
        synced.should.equal(false);
        done();
      });
    });
  });

  describe('#syncPercentage', function() {
    it('will give rpc error', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlockchainInfo = sinon.stub().callsArgWith(0, {message: 'error', code: -1});
      auroracoind.nodes.push({
        client: {
          getBlockchainInfo: getBlockchainInfo
        }
      });
      auroracoind.syncPercentage(function(err) {
        should.exist(err);
        err.should.be.an.instanceof(errors.RPCError);
        done();
      });
    });
    it('will call client getInfo and give result', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlockchainInfo = sinon.stub().callsArgWith(0, null, {
        result: {
          verificationprogress: '0.983821387'
        }
      });
      auroracoind.nodes.push({
        client: {
          getBlockchainInfo: getBlockchainInfo
        }
      });
      auroracoind.syncPercentage(function(err, percentage) {
        if (err) {
          return done(err);
        }
        percentage.should.equal(98.3821387);
        done();
      });
    });
  });

  describe('#_normalizeAddressArg', function() {
    it('will turn single address into array', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var args = auroracoind._normalizeAddressArg('address');
      args.should.deep.equal(['address']);
    });
    it('will keep an array as an array', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var args = auroracoind._normalizeAddressArg(['address', 'address']);
      args.should.deep.equal(['address', 'address']);
    });
  });

  describe('#getAddressBalance', function() {
    it('will give rpc error', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.nodes.push({
        client: {
          getAddressBalance: sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'})
        }
      });
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      var options = {};
      auroracoind.getAddressBalance(address, options, function(err) {
        err.should.be.instanceof(Error);
        done();
      });
    });
    it('will give balance', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getAddressBalance = sinon.stub().callsArgWith(1, null, {
        result: {
          received: 100000,
          balance: 10000
        }
      });
      auroracoind.nodes.push({
        client: {
          getAddressBalance: getAddressBalance
        }
      });
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      var options = {};
      auroracoind.getAddressBalance(address, options, function(err, data) {
        if (err) {
          return done(err);
        }
        data.balance.should.equal(10000);
        data.received.should.equal(100000);
        auroracoind.getAddressBalance(address, options, function(err, data2) {
          if (err) {
            return done(err);
          }
          data2.balance.should.equal(10000);
          data2.received.should.equal(100000);
          getAddressBalance.callCount.should.equal(1);
          done();
        });
      });
    });
  });

  describe('#getAddressUnspentOutputs', function() {
    it('will give rpc error', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.nodes.push({
        client: {
          getAddressUtxos: sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'})
        }
      });
      var options = {
        queryMempool: false
      };
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind.getAddressUnspentOutputs(address, options, function(err) {
        should.exist(err);
        err.should.be.instanceof(errors.RPCError);
        done();
      });
    });
    it('will give results from client getaddressutxos', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var expectedUtxos = [
        {
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 1,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 7679241,
          height: 207111
        }
      ];
      auroracoind.nodes.push({
        client: {
          getAddressUtxos: sinon.stub().callsArgWith(1, null, {
            result: expectedUtxos
          })
        }
      });
      var options = {
        queryMempool: false
      };
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind.getAddressUnspentOutputs(address, options, function(err, utxos) {
        if (err) {
          return done(err);
        }
        utxos.length.should.equal(1);
        utxos.should.deep.equal(expectedUtxos);
        done();
      });
    });
    it('will use cache', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var expectedUtxos = [
        {
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 1,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 7679241,
          height: 207111
        }
      ];
      var getAddressUtxos = sinon.stub().callsArgWith(1, null, {
        result: expectedUtxos
      });
      auroracoind.nodes.push({
        client: {
          getAddressUtxos: getAddressUtxos
        }
      });
      var options = {
        queryMempool: false
      };
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind.getAddressUnspentOutputs(address, options, function(err, utxos) {
        if (err) {
          return done(err);
        }
        utxos.length.should.equal(1);
        utxos.should.deep.equal(expectedUtxos);
        getAddressUtxos.callCount.should.equal(1);
        auroracoind.getAddressUnspentOutputs(address, options, function(err, utxos) {
          if (err) {
            return done(err);
          }
          utxos.length.should.equal(1);
          utxos.should.deep.equal(expectedUtxos);
          getAddressUtxos.callCount.should.equal(1);
          done();
        });
      });
    });
    it('will update with mempool results', function(done) {
      var deltas = [
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: -7679241,
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          index: 0,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 1
        },
        {
          txid: 'f637384e9f81f18767ea50e00bce58fc9848b6588a1130529eebba22a410155f',
          satoshis: 100000,
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          index: 0,
          timestamp: 1461342833133
        },
        {
          txid: 'f71bccef3a8f5609c7f016154922adbfe0194a96fb17a798c24077c18d0a9345',
          satoshis: 400000,
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          index: 1,
          timestamp: 1461342954813
        }
      ];
      var auroracoind = new AuroracoinService(baseConfig);
      var confirmedUtxos = [
        {
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 1,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 7679241,
          height: 207111
        }
      ];
      var expectedUtxos = [
        {
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          outputIndex: 1,
          satoshis: 400000,
          script: '76a914809dc14496f99b6deb722cf46d89d22f4beb8efd88ac',
          timestamp: 1461342954813,
          txid: 'f71bccef3a8f5609c7f016154922adbfe0194a96fb17a798c24077c18d0a9345'
        },
        {
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          outputIndex: 0,
          satoshis: 100000,
          script: '76a914809dc14496f99b6deb722cf46d89d22f4beb8efd88ac',
          timestamp: 1461342833133,
          txid: 'f637384e9f81f18767ea50e00bce58fc9848b6588a1130529eebba22a410155f'
        }
      ];
      auroracoind.nodes.push({
        client: {
          getAddressUtxos: sinon.stub().callsArgWith(1, null, {
            result: confirmedUtxos
          }),
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: deltas
          })
        }
      });
      var options = {
        queryMempool: true
      };
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind.getAddressUnspentOutputs(address, options, function(err, utxos) {
        if (err) {
          return done(err);
        }
        utxos.length.should.equal(2);
        utxos.should.deep.equal(expectedUtxos);
        done();
      });
    });
    it('will update with mempool results with multiple outputs', function(done) {
      var deltas = [
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: -7679241,
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          index: 0,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 1
        },
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: -7679241,
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          index: 1,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 2
        }
      ];
      var auroracoind = new AuroracoinService(baseConfig);
      var confirmedUtxos = [
        {
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 1,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 7679241,
          height: 207111
        },
        {
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 2,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 7679241,
          height: 207111
        }
      ];
      auroracoind.nodes.push({
        client: {
          getAddressUtxos: sinon.stub().callsArgWith(1, null, {
            result: confirmedUtxos
          }),
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: deltas
          })
        }
      });
      var options = {
        queryMempool: true
      };
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind.getAddressUnspentOutputs(address, options, function(err, utxos) {
        if (err) {
          return done(err);
        }
        utxos.length.should.equal(0);
        done();
      });
    });
    it('three confirmed utxos -> one utxo after mempool', function(done) {
      var deltas = [
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: -7679241,
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          index: 0,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 0
        },
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: -7679241,
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          index: 0,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 1
        },
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: -7679241,
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          index: 1,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 2
        },
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: 100000,
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          index: 1,
          script: '76a914809dc14496f99b6deb722cf46d89d22f4beb8efd88ac',
          timestamp: 1461342833133
        }
      ];
      var auroracoind = new AuroracoinService(baseConfig);
      var confirmedUtxos = [
        {
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 0,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 7679241,
          height: 207111
        },
        {
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 1,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 7679241,
          height: 207111
        },
        {
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 2,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 7679241,
          height: 207111
        }
      ];
      auroracoind.nodes.push({
        client: {
          getAddressUtxos: sinon.stub().callsArgWith(1, null, {
            result: confirmedUtxos
          }),
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: deltas
          })
        }
      });
      var options = {
        queryMempool: true
      };
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind.getAddressUnspentOutputs(address, options, function(err, utxos) {
        if (err) {
          return done(err);
        }
        utxos.length.should.equal(1);
        done();
      });
    });
    it('spending utxos in the mempool', function(done) {
      var deltas = [
        {
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          satoshis: 7679241,
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          index: 0,
          timestamp: 1461342707724
        },
        {
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          satoshis: 7679241,
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          index: 1,
          timestamp: 1461342707724
        },
        {
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          satoshis: 7679241,
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          timestamp: 1461342707724,
          index: 2,
        },
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: -7679241,
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          index: 0,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 0
        },
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: -7679241,
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          index: 0,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 1
        },
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: -7679241,
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          index: 1,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 2
        },
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: 100000,
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          index: 1,
          timestamp: 1461342833133
        }
      ];
      var auroracoind = new AuroracoinService(baseConfig);
      var confirmedUtxos = [];
      auroracoind.nodes.push({
        client: {
          getAddressUtxos: sinon.stub().callsArgWith(1, null, {
            result: confirmedUtxos
          }),
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: deltas
          })
        }
      });
      var options = {
        queryMempool: true
      };
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind.getAddressUnspentOutputs(address, options, function(err, utxos) {
        if (err) {
          return done(err);
        }
        utxos.length.should.equal(1);
        utxos[0].address.should.equal(address);
        utxos[0].txid.should.equal('e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce');
        utxos[0].outputIndex.should.equal(1);
        utxos[0].script.should.equal('76a914809dc14496f99b6deb722cf46d89d22f4beb8efd88ac');
        utxos[0].timestamp.should.equal(1461342833133);
        done();
      });
    });
    it('will update with mempool results spending zero value output (likely never to happen)', function(done) {
      var deltas = [
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: 0,
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          index: 0,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 1
        }
      ];
      var auroracoind = new AuroracoinService(baseConfig);
      var confirmedUtxos = [
        {
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 1,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 0,
          height: 207111
        }
      ];
      auroracoind.nodes.push({
        client: {
          getAddressUtxos: sinon.stub().callsArgWith(1, null, {
            result: confirmedUtxos
          }),
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: deltas
          })
        }
      });
      var options = {
        queryMempool: true
      };
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind.getAddressUnspentOutputs(address, options, function(err, utxos) {
        if (err) {
          return done(err);
        }
        utxos.length.should.equal(0);
        done();
      });
    });
    it('will not filter results if mempool is not spending', function(done) {
      var deltas = [
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: 10000,
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          index: 0,
          timestamp: 1461342707725
        }
      ];
      var auroracoind = new AuroracoinService(baseConfig);
      var confirmedUtxos = [
        {
          address: 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 1,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 0,
          height: 207111
        }
      ];
      auroracoind.nodes.push({
        client: {
          getAddressUtxos: sinon.stub().callsArgWith(1, null, {
            result: confirmedUtxos
          }),
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: deltas
          })
        }
      });
      var options = {
        queryMempool: true
      };
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind.getAddressUnspentOutputs(address, options, function(err, utxos) {
        if (err) {
          return done(err);
        }
        utxos.length.should.equal(2);
        done();
      });
    });
    it('it will handle error from getAddressMempool', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.nodes.push({
        client: {
          getAddressMempool: sinon.stub().callsArgWith(1, {code: -1, message: 'test'})
        }
      });
      var options = {
        queryMempool: true
      };
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind.getAddressUnspentOutputs(address, options, function(err) {
        err.should.be.instanceOf(Error);
        done();
      });
    });
    it('should set query mempool if undefined', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getAddressMempool = sinon.stub().callsArgWith(1, {code: -1, message: 'test'});
      auroracoind.nodes.push({
        client: {
          getAddressMempool: getAddressMempool
        }
      });
      var options = {};
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind.getAddressUnspentOutputs(address, options, function(err) {
        getAddressMempool.callCount.should.equal(1);
        done();
      });
    });
  });

  describe('#_getBalanceFromMempool', function() {
    it('will sum satoshis', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var deltas = [
        {
          satoshis: -1000,
        },
        {
          satoshis: 2000,
        },
        {
          satoshis: -10,
        }
      ];
      var sum = auroracoind._getBalanceFromMempool(deltas);
      sum.should.equal(990);
    });
  });

  describe('#_getTxidsFromMempool', function() {
    it('will filter to txids', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var deltas = [
        {
          txid: 'txid0',
        },
        {
          txid: 'txid1',
        },
        {
          txid: 'txid2',
        }
      ];
      var txids = auroracoind._getTxidsFromMempool(deltas);
      txids.length.should.equal(3);
      txids[0].should.equal('txid0');
      txids[1].should.equal('txid1');
      txids[2].should.equal('txid2');
    });
    it('will not include duplicates', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var deltas = [
        {
          txid: 'txid0',
        },
        {
          txid: 'txid0',
        },
        {
          txid: 'txid1',
        }
      ];
      var txids = auroracoind._getTxidsFromMempool(deltas);
      txids.length.should.equal(2);
      txids[0].should.equal('txid0');
      txids[1].should.equal('txid1');
    });
  });

  describe('#_getHeightRangeQuery', function() {
    it('will detect range query', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var options = {
        start: 20,
        end: 0
      };
      var rangeQuery = auroracoind._getHeightRangeQuery(options);
      rangeQuery.should.equal(true);
    });
    it('will get range properties', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var options = {
        start: 20,
        end: 0
      };
      var clone = {};
      auroracoind._getHeightRangeQuery(options, clone);
      clone.end.should.equal(20);
      clone.start.should.equal(0);
    });
    it('will throw error with invalid range', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var options = {
        start: 0,
        end: 20
      };
      (function() {
        auroracoind._getHeightRangeQuery(options);
      }).should.throw('"end" is expected');
    });
  });

  describe('#getAddressTxids', function() {
    it('will give error from _getHeightRangeQuery', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind._getHeightRangeQuery = sinon.stub().throws(new Error('test'));
      auroracoind.getAddressTxids('address', {}, function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will give rpc error from mempool query', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.nodes.push({
        client: {
          getAddressMempool: sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'})
        }
      });
      var options = {};
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind.getAddressTxids(address, options, function(err) {
        should.exist(err);
        err.should.be.instanceof(errors.RPCError);
      });
    });
    it('will give rpc error from txids query', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.nodes.push({
        client: {
          getAddressTxids: sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'})
        }
      });
      var options = {
        queryMempool: false
      };
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind.getAddressTxids(address, options, function(err) {
        should.exist(err);
        err.should.be.instanceof(errors.RPCError);
      });
    });
    it('will get txid results', function(done) {
      var expectedTxids = [
        'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
        'f637384e9f81f18767ea50e00bce58fc9848b6588a1130529eebba22a410155f',
        'f3c1ba3ef86a0420d6102e40e2cfc8682632ab95d09d86a27f5d466b9fa9da47',
        '56fafeb01961831b926558d040c246b97709fd700adcaa916541270583e8e579',
        'bc992ad772eb02864db07ef248d31fb3c6826d25f1153ebf8c79df9b7f70fcf2',
        'f71bccef3a8f5609c7f016154922adbfe0194a96fb17a798c24077c18d0a9345',
        'f35e7e2a2334e845946f3eaca76890d9a68f4393ccc9fe37a0c2fb035f66d2e9',
        'edc080f2084eed362aa488ccc873a24c378dc0979aa29b05767517b70569414a',
        'ed11a08e3102f9610bda44c80c46781d97936a4290691d87244b1b345b39a693',
        'ec94d845c603f292a93b7c829811ac624b76e52b351617ca5a758e9d61a11681'
      ];
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.nodes.push({
        client: {
          getAddressTxids: sinon.stub().callsArgWith(1, null, {
            result: expectedTxids.reverse()
          })
        }
      });
      var options = {
        queryMempool: false
      };
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind.getAddressTxids(address, options, function(err, txids) {
        if (err) {
          return done(err);
        }
        txids.length.should.equal(expectedTxids.length);
        txids.should.deep.equal(expectedTxids);
        done();
      });
    });
    it('will get txid results from cache', function(done) {
      var expectedTxids = [
        'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce'
      ];
      var auroracoind = new AuroracoinService(baseConfig);
      var getAddressTxids = sinon.stub().callsArgWith(1, null, {
        result: expectedTxids.reverse()
      });
      auroracoind.nodes.push({
        client: {
          getAddressTxids: getAddressTxids
        }
      });
      var options = {
        queryMempool: false
      };
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind.getAddressTxids(address, options, function(err, txids) {
        if (err) {
          return done(err);
        }
        getAddressTxids.callCount.should.equal(1);
        txids.should.deep.equal(expectedTxids);

        auroracoind.getAddressTxids(address, options, function(err, txids) {
          if (err) {
            return done(err);
          }
          getAddressTxids.callCount.should.equal(1);
          txids.should.deep.equal(expectedTxids);
          done();
        });
      });
    });
    it('will get txid results WITHOUT cache if rangeQuery and exclude mempool', function(done) {
      var expectedTxids = [
        'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce'
      ];
      var auroracoind = new AuroracoinService(baseConfig);
      var getAddressMempool = sinon.stub();
      var getAddressTxids = sinon.stub().callsArgWith(1, null, {
        result: expectedTxids.reverse()
      });
      auroracoind.nodes.push({
        client: {
          getAddressTxids: getAddressTxids,
          getAddressMempool: getAddressMempool
        }
      });
      var options = {
        queryMempool: true, // start and end will exclude mempool
        start: 4,
        end: 2
      };
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind.getAddressTxids(address, options, function(err, txids) {
        if (err) {
          return done(err);
        }
        getAddressTxids.callCount.should.equal(1);
        getAddressMempool.callCount.should.equal(0);
        txids.should.deep.equal(expectedTxids);

        auroracoind.getAddressTxids(address, options, function(err, txids) {
          if (err) {
            return done(err);
          }
          getAddressTxids.callCount.should.equal(2);
          getAddressMempool.callCount.should.equal(0);
          txids.should.deep.equal(expectedTxids);
          done();
        });
      });
    });
    it('will get txid results from cache and live mempool', function(done) {
      var expectedTxids = [
        'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce'
      ];
      var auroracoind = new AuroracoinService(baseConfig);
      var getAddressTxids = sinon.stub().callsArgWith(1, null, {
        result: expectedTxids.reverse()
      });
      var getAddressMempool = sinon.stub().callsArgWith(1, null, {
        result: [
          {
            txid: 'bc992ad772eb02864db07ef248d31fb3c6826d25f1153ebf8c79df9b7f70fcf2'
          },
          {
            txid: 'f71bccef3a8f5609c7f016154922adbfe0194a96fb17a798c24077c18d0a9345'
          },
          {
            txid: 'f35e7e2a2334e845946f3eaca76890d9a68f4393ccc9fe37a0c2fb035f66d2e9'
          }
        ]
      });
      auroracoind.nodes.push({
        client: {
          getAddressTxids: getAddressTxids,
          getAddressMempool: getAddressMempool
        }
      });
      var address = 'LWx1jmpcMAQMXou6pbLyfMU7zETnbhy3bo';
      auroracoind.getAddressTxids(address, {queryMempool: false}, function(err, txids) {
        if (err) {
          return done(err);
        }
        getAddressTxids.callCount.should.equal(1);
        txids.should.deep.equal(expectedTxids);

        auroracoind.getAddressTxids(address, {queryMempool: true}, function(err, txids) {
          if (err) {
            return done(err);
          }
          getAddressTxids.callCount.should.equal(1);
          txids.should.deep.equal([
            'f35e7e2a2334e845946f3eaca76890d9a68f4393ccc9fe37a0c2fb035f66d2e9', // mempool
            'f71bccef3a8f5609c7f016154922adbfe0194a96fb17a798c24077c18d0a9345', // mempool
            'bc992ad772eb02864db07ef248d31fb3c6826d25f1153ebf8c79df9b7f70fcf2', // mempool
            'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce' // confirmed
          ]);

          auroracoind.getAddressTxids(address, {queryMempoolOnly: true}, function(err, txids) {
            if (err) {
              return done(err);
            }
            getAddressTxids.callCount.should.equal(1);
            txids.should.deep.equal([
              'f35e7e2a2334e845946f3eaca76890d9a68f4393ccc9fe37a0c2fb035f66d2e9', // mempool
              'f71bccef3a8f5609c7f016154922adbfe0194a96fb17a798c24077c18d0a9345', // mempool
              'bc992ad772eb02864db07ef248d31fb3c6826d25f1153ebf8c79df9b7f70fcf2', // mempool
            ]);
            done();
          });
        });
      });
    });
  });

  describe('#_getConfirmationDetail', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'warn');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('should get 0 confirmation', function() {
      var tx = new Transaction(txhex);
      tx.height = -1;
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.height = 10;
      var confirmations = auroracoind._getConfirmationsDetail(tx);
      confirmations.should.equal(0);
    });
    it('should get 1 confirmation', function() {
      var tx = new Transaction(txhex);
      tx.height = 10;
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.height = 10;
      var confirmations = auroracoind._getConfirmationsDetail(tx);
      confirmations.should.equal(1);
    });
    it('should get 2 confirmation', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var tx = new Transaction(txhex);
      auroracoind.height = 11;
      tx.height = 10;
      var confirmations = auroracoind._getConfirmationsDetail(tx);
      confirmations.should.equal(2);
    });
    it('should get 0 confirmation with overflow', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var tx = new Transaction(txhex);
      auroracoind.height = 3;
      tx.height = 10;
      var confirmations = auroracoind._getConfirmationsDetail(tx);
      log.warn.callCount.should.equal(1);
      confirmations.should.equal(0);
    });
    it('should get 1000 confirmation', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var tx = new Transaction(txhex);
      auroracoind.height = 1000;
      tx.height = 1;
      var confirmations = auroracoind._getConfirmationsDetail(tx);
      confirmations.should.equal(1000);
    });
  });

  describe('#_getAddressDetailsForInput', function() {
    it('will return if missing an address', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var result = {};
      auroracoind._getAddressDetailsForInput({}, 0, result, []);
      should.not.exist(result.addresses);
      should.not.exist(result.satoshis);
    });
    it('will only add address if it matches', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var result = {};
      auroracoind._getAddressDetailsForInput({
        address: 'address1'
      }, 0, result, ['address2']);
      should.not.exist(result.addresses);
      should.not.exist(result.satoshis);
    });
    it('will instantiate if outputIndexes not defined', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var result = {
        addresses: {}
      };
      auroracoind._getAddressDetailsForInput({
        address: 'address1'
      }, 0, result, ['address1']);
      should.exist(result.addresses);
      result.addresses['address1'].inputIndexes.should.deep.equal([0]);
      result.addresses['address1'].outputIndexes.should.deep.equal([]);
    });
    it('will push to inputIndexes', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var result = {
        addresses: {
          'address1': {
            inputIndexes: [1]
          }
        }
      };
      auroracoind._getAddressDetailsForInput({
        address: 'address1'
      }, 2, result, ['address1']);
      should.exist(result.addresses);
      result.addresses['address1'].inputIndexes.should.deep.equal([1, 2]);
    });
  });

  describe('#_getAddressDetailsForOutput', function() {
    it('will return if missing an address', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var result = {};
      auroracoind._getAddressDetailsForOutput({}, 0, result, []);
      should.not.exist(result.addresses);
      should.not.exist(result.satoshis);
    });
    it('will only add address if it matches', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var result = {};
      auroracoind._getAddressDetailsForOutput({
        address: 'address1'
      }, 0, result, ['address2']);
      should.not.exist(result.addresses);
      should.not.exist(result.satoshis);
    });
    it('will instantiate if outputIndexes not defined', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var result = {
        addresses: {}
      };
      auroracoind._getAddressDetailsForOutput({
        address: 'address1'
      }, 0, result, ['address1']);
      should.exist(result.addresses);
      result.addresses['address1'].inputIndexes.should.deep.equal([]);
      result.addresses['address1'].outputIndexes.should.deep.equal([0]);
    });
    it('will push if outputIndexes defined', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var result = {
        addresses: {
          'address1': {
            outputIndexes: [0]
          }
        }
      };
      auroracoind._getAddressDetailsForOutput({
        address: 'address1'
      }, 1, result, ['address1']);
      should.exist(result.addresses);
      result.addresses['address1'].outputIndexes.should.deep.equal([0, 1]);
    });
  });

  describe('#_getAddressDetailsForTransaction', function() {
    it('will calculate details for the transaction', function(done) {
      /* jshint sub:true */
      var tx = {
        inputs: [
          {
            satoshis: 1000000000,
            address: 'mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'
          }
        ],
        outputs: [
          {
            satoshis: 100000000,
            address: 'mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'
          },
          {
            satoshis: 200000000,
            address: 'mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'
          },
          {
            satoshis: 50000000,
            address: 'mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'
          },
          {
            satoshis: 300000000,
            address: 'mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'
          },
          {
            satoshis: 349990000,
            address: 'mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'
          }
        ],
        locktime: 0
      };
      var auroracoind = new AuroracoinService(baseConfig);
      var addresses = ['mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'];
      var details = auroracoind._getAddressDetailsForTransaction(tx, addresses);
      should.exist(details.addresses['mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW']);
      details.addresses['mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'].inputIndexes.should.deep.equal([0]);
      details.addresses['mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'].outputIndexes.should.deep.equal([
        0, 1, 2, 3, 4
      ]);
      details.satoshis.should.equal(-10000);
      done();
    });
  });

  describe('#_getAddressDetailedTransaction', function() {
    it('will get detailed transaction info', function(done) {
      var txid = '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0';
      var tx = {
        height: 20,
      };
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.getDetailedTransaction = sinon.stub().callsArgWith(1, null, tx);
      auroracoind.height = 300;
      var addresses = {};
      auroracoind._getAddressDetailsForTransaction = sinon.stub().returns({
        addresses: addresses,
        satoshis: 1000,
      });
      auroracoind._getAddressDetailedTransaction(txid, {}, function(err, details) {
        if (err) {
          return done(err);
        }
        details.addresses.should.equal(addresses);
        details.satoshis.should.equal(1000);
        details.confirmations.should.equal(281);
        details.tx.should.equal(tx);
        done();
      });
    });
    it('give error from getDetailedTransaction', function(done) {
      var txid = '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0';
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.getDetailedTransaction = sinon.stub().callsArgWith(1, new Error('test'));
      auroracoind._getAddressDetailedTransaction(txid, {}, function(err) {
        err.should.be.instanceof(Error);
        done();
      });
    });
  });

  describe('#_getAddressStrings', function() {
    it('will get address strings from bitcore addresses', function() {
      var addresses = [
        bitcore.Address('LUVKqDPPVBQcjUwt1S21Pa5ybgPaDEZhXR'),
        bitcore.Address('3CMNFxN1oHBc4R1EpboAL5yzHGgE611Xou'),
      ];
      var auroracoind = new AuroracoinService(baseConfig);
      var strings = auroracoind._getAddressStrings(addresses);
      strings[0].should.equal('LUVKqDPPVBQcjUwt1S21Pa5ybgPaDEZhXR');
      strings[1].should.equal('3CMNFxN1oHBc4R1EpboAL5yzHGgE611Xou');
    });
    it('will get address strings from strings', function() {
      var addresses = [
        'LUVKqDPPVBQcjUwt1S21Pa5ybgPaDEZhXR',
        '3CMNFxN1oHBc4R1EpboAL5yzHGgE611Xou',
      ];
      var auroracoind = new AuroracoinService(baseConfig);
      var strings = auroracoind._getAddressStrings(addresses);
      strings[0].should.equal('LUVKqDPPVBQcjUwt1S21Pa5ybgPaDEZhXR');
      strings[1].should.equal('3CMNFxN1oHBc4R1EpboAL5yzHGgE611Xou');
    });
    it('will get address strings from mixture of types', function() {
      var addresses = [
        bitcore.Address('LUVKqDPPVBQcjUwt1S21Pa5ybgPaDEZhXR'),
        '3CMNFxN1oHBc4R1EpboAL5yzHGgE611Xou',
      ];
      var auroracoind = new AuroracoinService(baseConfig);
      var strings = auroracoind._getAddressStrings(addresses);
      strings[0].should.equal('LUVKqDPPVBQcjUwt1S21Pa5ybgPaDEZhXR');
      strings[1].should.equal('3CMNFxN1oHBc4R1EpboAL5yzHGgE611Xou');
    });
    it('will give error with unknown', function() {
      var addresses = [
        bitcore.Address('LUVKqDPPVBQcjUwt1S21Pa5ybgPaDEZhXR'),
        0,
      ];
      var auroracoind = new AuroracoinService(baseConfig);
      (function() {
        auroracoind._getAddressStrings(addresses);
      }).should.throw(TypeError);
    });
  });

  describe('#_paginateTxids', function() {
    it('slice txids based on "from" and "to" (3 to 13)', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var txids = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      var paginated = auroracoind._paginateTxids(txids, 3, 13);
      paginated.should.deep.equal([3, 4, 5, 6, 7, 8, 9, 10]);
    });
    it('slice txids based on "from" and "to" (0 to 3)', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var txids = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      var paginated = auroracoind._paginateTxids(txids, 0, 3);
      paginated.should.deep.equal([0, 1, 2]);
    });
    it('slice txids based on "from" and "to" (0 to 1)', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var txids = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      var paginated = auroracoind._paginateTxids(txids, 0, 1);
      paginated.should.deep.equal([0]);
    });
    it('will throw error if "from" is greater than "to"', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var txids = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      (function() {
        auroracoind._paginateTxids(txids, 1, 0);
      }).should.throw('"from" (1) is expected to be less than "to"');
    });
    it('will handle string numbers', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var txids = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      var paginated = auroracoind._paginateTxids(txids, '1', '3');
      paginated.should.deep.equal([1, 2]);
    });
  });

  describe('#getAddressHistory', function() {
    var address = '12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX';
    it('will give error with "from" and "to" range that exceeds max size', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.getAddressHistory(address, {from: 0, to: 51}, function(err) {
        should.exist(err);
        err.message.match(/^\"from/);
        done();
      });
    });
    it('will give error with "from" and "to" order is reversed', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.getAddressTxids = sinon.stub().callsArgWith(2, null, []);
      auroracoind.getAddressHistory(address, {from: 51, to: 0}, function(err) {
        should.exist(err);
        err.message.match(/^\"from/);
        done();
      });
    });
    it('will give error from _getAddressDetailedTransaction', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.getAddressTxids = sinon.stub().callsArgWith(2, null, ['txid']);
      auroracoind._getAddressDetailedTransaction = sinon.stub().callsArgWith(2, new Error('test'));
      auroracoind.getAddressHistory(address, {}, function(err) {
        should.exist(err);
        err.message.should.equal('test');
        done();
      });
    });
    it('will give an error if length of addresses is too long', function(done) {
      var addresses = [];
      for (var i = 0; i < 101; i++) {
        addresses.push(address);
      }
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.maxAddressesQuery = 100;
      auroracoind.getAddressHistory(addresses, {}, function(err) {
        should.exist(err);
        err.message.match(/Maximum/);
        done();
      });
    });
    it('give error from getAddressTxids', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.getAddressTxids = sinon.stub().callsArgWith(2, new Error('test'));
      auroracoind.getAddressHistory('address', {}, function(err) {
        should.exist(err);
        err.should.be.instanceof(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will paginate', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind._getAddressDetailedTransaction = function(txid, options, callback) {
        callback(null, txid);
      };
      var txids = ['one', 'two', 'three', 'four'];
      auroracoind.getAddressTxids = sinon.stub().callsArgWith(2, null, txids);
      auroracoind.getAddressHistory('address', {from: 1, to: 3}, function(err, data) {
        if (err) {
          return done(err);
        }
        data.items.length.should.equal(2);
        data.items.should.deep.equal(['two', 'three']);
        done();
      });
    });
  });

  describe('#getAddressSummary', function() {
    var txid1 = '70d9d441d7409aace8e0ffe24ff0190407b2fcb405799a266e0327017288d1f8';
    var txid2 = '35fafaf572341798b2ce2858755afa7c8800bb6b1e885d3e030b81255b5e172d';
    var txid3 = '57b7842afc97a2b46575b490839df46e9273524c6ea59ba62e1e86477cf25247';
    var memtxid1 = 'b1bfa8dbbde790cb46b9763ef3407c1a21c8264b67bfe224f462ec0e1f569e92';
    var memtxid2 = 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce';
    it('will handle error from getAddressTxids', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.nodes.push({
        client: {
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: [
              {
                txid: '70d9d441d7409aace8e0ffe24ff0190407b2fcb405799a266e0327017288d1f8',
              }
            ]
          })
        }
      });
      auroracoind.getAddressTxids = sinon.stub().callsArgWith(2, new Error('test'));
      auroracoind.getAddressBalance = sinon.stub().callsArgWith(2, null, {});
      var address = '';
      var options = {};
      auroracoind.getAddressSummary(address, options, function(err) {
        should.exist(err);
        err.should.be.instanceof(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will handle error from getAddressBalance', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.nodes.push({
        client: {
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: [
              {
                txid: '70d9d441d7409aace8e0ffe24ff0190407b2fcb405799a266e0327017288d1f8',
              }
            ]
          })
        }
      });
      auroracoind.getAddressTxids = sinon.stub().callsArgWith(2, null, {});
      auroracoind.getAddressBalance = sinon.stub().callsArgWith(2, new Error('test'), {});
      var address = '';
      var options = {};
      auroracoind.getAddressSummary(address, options, function(err) {
        should.exist(err);
        err.should.be.instanceof(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will handle error from client getAddressMempool', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.nodes.push({
        client: {
          getAddressMempool: sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'})
        }
      });
      auroracoind.getAddressTxids = sinon.stub().callsArgWith(2, null, {});
      auroracoind.getAddressBalance = sinon.stub().callsArgWith(2, null, {});
      var address = '';
      var options = {};
      auroracoind.getAddressSummary(address, options, function(err) {
        should.exist(err);
        err.should.be.instanceof(Error);
        err.message.should.equal('Test error');
        done();
      });
    });
    it('should set all properties', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.nodes.push({
        client: {
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: [
              {
                txid: memtxid1,
                satoshis: -1000000
              },
              {
                txid: memtxid2,
                satoshis: 99999
              }
            ]
          })
        }
      });
      sinon.spy(auroracoind, '_paginateTxids');
      auroracoind.getAddressTxids = sinon.stub().callsArgWith(2, null, [txid1, txid2, txid3]);
      auroracoind.getAddressBalance = sinon.stub().callsArgWith(2, null, {
        received: 30 * 1e8,
        balance: 20 * 1e8
      });
      var address = '3NbU8XzUgKyuCgYgZEKsBtUvkTm2r7Xgwj';
      var options = {};
      auroracoind.getAddressSummary(address, options, function(err, summary) {
        auroracoind._paginateTxids.callCount.should.equal(1);
        auroracoind._paginateTxids.args[0][1].should.equal(0);
        auroracoind._paginateTxids.args[0][2].should.equal(1000);
        summary.appearances.should.equal(3);
        summary.totalReceived.should.equal(3000000000);
        summary.totalSpent.should.equal(1000000000);
        summary.balance.should.equal(2000000000);
        summary.unconfirmedAppearances.should.equal(2);
        summary.unconfirmedBalance.should.equal(-900001);
        summary.txids.should.deep.equal([
          'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          'b1bfa8dbbde790cb46b9763ef3407c1a21c8264b67bfe224f462ec0e1f569e92',
          '70d9d441d7409aace8e0ffe24ff0190407b2fcb405799a266e0327017288d1f8',
          '35fafaf572341798b2ce2858755afa7c8800bb6b1e885d3e030b81255b5e172d',
          '57b7842afc97a2b46575b490839df46e9273524c6ea59ba62e1e86477cf25247'
        ]);
        done();
      });
    });
    it('will give error with "from" and "to" range that exceeds max size', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.nodes.push({
        client: {
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: [
              {
                txid: memtxid1,
                satoshis: -1000000
              },
              {
                txid: memtxid2,
                satoshis: 99999
              }
            ]
          })
        }
      });
      auroracoind.getAddressTxids = sinon.stub().callsArgWith(2, null, [txid1, txid2, txid3]);
      auroracoind.getAddressBalance = sinon.stub().callsArgWith(2, null, {
        received: 30 * 1e8,
        balance: 20 * 1e8
      });
      var address = '3NbU8XzUgKyuCgYgZEKsBtUvkTm2r7Xgwj';
      var options = {
        from: 0,
        to: 1001
      };
      auroracoind.getAddressSummary(address, options, function(err) {
        should.exist(err);
        err.message.match(/^\"from/);
        done();
      });
    });
    it('will get from cache with noTxList', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.nodes.push({
        client: {
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: [
              {
                txid: memtxid1,
                satoshis: -1000000
              },
              {
                txid: memtxid2,
                satoshis: 99999
              }
            ]
          })
        }
      });
      auroracoind.getAddressTxids = sinon.stub().callsArgWith(2, null, [txid1, txid2, txid3]);
      auroracoind.getAddressBalance = sinon.stub().callsArgWith(2, null, {
        received: 30 * 1e8,
        balance: 20 * 1e8
      });
      var address = '3NbU8XzUgKyuCgYgZEKsBtUvkTm2r7Xgwj';
      var options = {
        noTxList: true
      };
      function checkSummary(summary) {
        summary.appearances.should.equal(3);
        summary.totalReceived.should.equal(3000000000);
        summary.totalSpent.should.equal(1000000000);
        summary.balance.should.equal(2000000000);
        summary.unconfirmedAppearances.should.equal(2);
        summary.unconfirmedBalance.should.equal(-900001);
        should.not.exist(summary.txids);
      }
      auroracoind.getAddressSummary(address, options, function(err, summary) {
        checkSummary(summary);
        auroracoind.getAddressTxids.callCount.should.equal(1);
        auroracoind.getAddressBalance.callCount.should.equal(1);
        auroracoind.getAddressSummary(address, options, function(err, summary) {
          checkSummary(summary);
          auroracoind.getAddressTxids.callCount.should.equal(1);
          auroracoind.getAddressBalance.callCount.should.equal(1);
          done();
        });
      });
    });
    it('will skip querying the mempool with queryMempool set to false', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getAddressMempool = sinon.stub();
      auroracoind.nodes.push({
        client: {
          getAddressMempool: getAddressMempool
        }
      });
      sinon.spy(auroracoind, '_paginateTxids');
      auroracoind.getAddressTxids = sinon.stub().callsArgWith(2, null, [txid1, txid2, txid3]);
      auroracoind.getAddressBalance = sinon.stub().callsArgWith(2, null, {
        received: 30 * 1e8,
        balance: 20 * 1e8
      });
      var address = '3NbU8XzUgKyuCgYgZEKsBtUvkTm2r7Xgwj';
      var options = {
        queryMempool: false
      };
      auroracoind.getAddressSummary(address, options, function() {
        getAddressMempool.callCount.should.equal(0);
        done();
      });
    });
    it('will give error from _paginateTxids', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getAddressMempool = sinon.stub();
      auroracoind.nodes.push({
        client: {
          getAddressMempool: getAddressMempool
        }
      });
      sinon.spy(auroracoind, '_paginateTxids');
      auroracoind.getAddressTxids = sinon.stub().callsArgWith(2, null, [txid1, txid2, txid3]);
      auroracoind.getAddressBalance = sinon.stub().callsArgWith(2, null, {
        received: 30 * 1e8,
        balance: 20 * 1e8
      });
      auroracoind._paginateTxids = sinon.stub().throws(new Error('test'));
      var address = '3NbU8XzUgKyuCgYgZEKsBtUvkTm2r7Xgwj';
      var options = {
        queryMempool: false
      };
      auroracoind.getAddressSummary(address, options, function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        done();
      });
    });
  });

  describe('#getRawBlock', function() {
    var blockhash = '00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b';
    var blockhex = '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c0101000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000';
    it('will give rcp error from client getblockhash', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.nodes.push({
        client: {
          getBlockHash: sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'})
        }
      });
      auroracoind.getRawBlock(10, function(err) {
        should.exist(err);
        err.should.be.instanceof(errors.RPCError);
        done();
      });
    });
    it('will give rcp error from client getblock', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.nodes.push({
        client: {
          getBlock: sinon.stub().callsArgWith(2, {code: -1, message: 'Test error'})
        }
      });
      auroracoind.getRawBlock(blockhash, function(err) {
        should.exist(err);
        err.should.be.instanceof(errors.RPCError);
        done();
      });
    });
    it('will try all nodes for getblock', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlockWithError = sinon.stub().callsArgWith(2, {code: -1, message: 'Test error'});
      auroracoind.tryAllInterval = 1;
      auroracoind.nodes.push({
        client: {
          getBlock: getBlockWithError
        }
      });
      auroracoind.nodes.push({
        client: {
          getBlock: getBlockWithError
        }
      });
      auroracoind.nodes.push({
        client: {
          getBlock: sinon.stub().callsArgWith(2, null, {
            result: blockhex
          })
        }
      });
      auroracoind.getRawBlock(blockhash, function(err, buffer) {
        if (err) {
          return done(err);
        }
        buffer.should.be.instanceof(Buffer);
        getBlockWithError.callCount.should.equal(2);
        done();
      });
    });
    it('will get block from cache', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlock = sinon.stub().callsArgWith(2, null, {
        result: blockhex
      });
      auroracoind.nodes.push({
        client: {
          getBlock: getBlock
        }
      });
      auroracoind.getRawBlock(blockhash, function(err, buffer) {
        if (err) {
          return done(err);
        }
        buffer.should.be.instanceof(Buffer);
        getBlock.callCount.should.equal(1);
        auroracoind.getRawBlock(blockhash, function(err, buffer) {
          if (err) {
            return done(err);
          }
          buffer.should.be.instanceof(Buffer);
          getBlock.callCount.should.equal(1);
          done();
        });
      });
    });
    it('will get block by height', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlock = sinon.stub().callsArgWith(2, null, {
        result: blockhex
      });
      var getBlockHash = sinon.stub().callsArgWith(1, null, {
        result: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f'
      });
      auroracoind.nodes.push({
        client: {
          getBlock: getBlock,
          getBlockHash: getBlockHash
        }
      });
      auroracoind.getRawBlock(0, function(err, buffer) {
        if (err) {
          return done(err);
        }
        buffer.should.be.instanceof(Buffer);
        getBlock.callCount.should.equal(1);
        getBlockHash.callCount.should.equal(1);
        done();
      });
    });
  });

  describe('#getBlock', function() {
    var blockhex = '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c0101000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000';
    it('will give an rpc error from client getblock', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlock = sinon.stub().callsArgWith(2, {code: -1, message: 'Test error'});
      var getBlockHash = sinon.stub().callsArgWith(1, null, {});
      auroracoind.nodes.push({
        client: {
          getBlock: getBlock,
          getBlockHash: getBlockHash
        }
      });
      auroracoind.getBlock(0, function(err) {
        err.should.be.instanceof(Error);
        done();
      });
    });
    it('will give an rpc error from client getblockhash', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlockHash = sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'});
      auroracoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      auroracoind.getBlock(0, function(err) {
        err.should.be.instanceof(Error);
        done();
      });
    });
    it('will getblock as bitcore object from height', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlock = sinon.stub().callsArgWith(2, null, {
        result: blockhex
      });
      var getBlockHash = sinon.stub().callsArgWith(1, null, {
        result: '00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b'
      });
      auroracoind.nodes.push({
        client: {
          getBlock: getBlock,
          getBlockHash: getBlockHash
        }
      });
      auroracoind.getBlock(0, function(err, block) {
        should.not.exist(err);
        getBlock.args[0][0].should.equal('00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b');
        getBlock.args[0][1].should.equal(false);
        block.should.be.instanceof(bitcore.Block);
        done();
      });
    });
    it('will getblock as bitcore object', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlock = sinon.stub().callsArgWith(2, null, {
        result: blockhex
      });
      var getBlockHash = sinon.stub();
      auroracoind.nodes.push({
        client: {
          getBlock: getBlock,
          getBlockHash: getBlockHash
        }
      });
      auroracoind.getBlock('00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b', function(err, block) {
        should.not.exist(err);
        getBlockHash.callCount.should.equal(0);
        getBlock.callCount.should.equal(1);
        getBlock.args[0][0].should.equal('00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b');
        getBlock.args[0][1].should.equal(false);
        block.should.be.instanceof(bitcore.Block);
        done();
      });
    });
    it('will get block from cache', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlock = sinon.stub().callsArgWith(2, null, {
        result: blockhex
      });
      var getBlockHash = sinon.stub();
      auroracoind.nodes.push({
        client: {
          getBlock: getBlock,
          getBlockHash: getBlockHash
        }
      });
      var hash = '00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b';
      auroracoind.getBlock(hash, function(err, block) {
        should.not.exist(err);
        getBlockHash.callCount.should.equal(0);
        getBlock.callCount.should.equal(1);
        block.should.be.instanceof(bitcore.Block);
        auroracoind.getBlock(hash, function(err, block) {
          should.not.exist(err);
          getBlockHash.callCount.should.equal(0);
          getBlock.callCount.should.equal(1);
          block.should.be.instanceof(bitcore.Block);
          done();
        });
      });
    });
    it('will get block from cache with height (but not height)', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlock = sinon.stub().callsArgWith(2, null, {
        result: blockhex
      });
      var getBlockHash = sinon.stub().callsArgWith(1, null, {
        result: '00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b'
      });
      auroracoind.nodes.push({
        client: {
          getBlock: getBlock,
          getBlockHash: getBlockHash
        }
      });
      auroracoind.getBlock(0, function(err, block) {
        should.not.exist(err);
        getBlockHash.callCount.should.equal(1);
        getBlock.callCount.should.equal(1);
        block.should.be.instanceof(bitcore.Block);
        auroracoind.getBlock(0, function(err, block) {
          should.not.exist(err);
          getBlockHash.callCount.should.equal(2);
          getBlock.callCount.should.equal(1);
          block.should.be.instanceof(bitcore.Block);
          done();
        });
      });
    });
  });

  describe('#getBlockHashesByTimestamp', function() {
    it('should give an rpc error', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlockHashes = sinon.stub().callsArgWith(3, {message: 'error', code: -1});
      auroracoind.nodes.push({
        client: {
          getBlockHashes: getBlockHashes
        }
      });
      auroracoind.getBlockHashesByTimestamp(1441911000, 1441914000, function(err, hashes) {
        should.exist(err);
        err.message.should.equal('error');
        done();
      });
    });
    it('should get the correct block hashes', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var block1 = '00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b';
      var block2 = '000000000383752a55a0b2891ce018fd0fdc0b6352502772b034ec282b4a1bf6';
      var getBlockHashes = sinon.stub().callsArgWith(3, null, {
        result: [block2, block1]
      });
      auroracoind.nodes.push({
        client: {
          getBlockHashes: getBlockHashes
        }
      });
      auroracoind.getBlockHashesByTimestamp(1441914000, 1441911000, function(err, hashes) {
        should.not.exist(err);
        hashes.should.deep.equal([block2, block1]);
        done();
      });
    });
  });

  describe('#getBlockHeader', function() {
    var blockhash = '00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b';
    it('will give error from getBlockHash', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlockHash = sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'});
      auroracoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      auroracoind.getBlockHeader(10, function(err) {
        err.should.be.instanceof(Error);
      });
    });
    it('it will give rpc error from client getblockheader', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlockHeader = sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'});
      auroracoind.nodes.push({
        client: {
          getBlockHeader: getBlockHeader
        }
      });
      auroracoind.getBlockHeader(blockhash, function(err) {
        err.should.be.instanceof(Error);
      });
    });
    it('it will give rpc error from client getblockhash', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlockHeader = sinon.stub();
      var getBlockHash = sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'});
      auroracoind.nodes.push({
        client: {
          getBlockHeader: getBlockHeader,
          getBlockHash: getBlockHash
        }
      });
      auroracoind.getBlockHeader(0, function(err) {
        err.should.be.instanceof(Error);
      });
    });
    it('will give result from client getblockheader (from height)', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var result = {
        hash: '0000000000000a817cd3a74aec2f2246b59eb2cbb1ad730213e6c4a1d68ec2f6',
        version: 536870912,
        confirmations: 5,
        height: 828781,
        chainWork: '00000000000000000000000000000000000000000000000ad467352c93bc6a3b',
        prevHash: '0000000000000504235b2aff578a48470dbf6b94dafa9b3703bbf0ed554c9dd9',
        nextHash: '00000000000000eedd967ec155f237f033686f0924d574b946caf1b0e89551b8',
        merkleRoot: '124e0f3fb5aa268f102b0447002dd9700988fc570efcb3e0b5b396ac7db437a9',
        time: 1462979126,
        medianTime: 1462976771,
        nonce: 2981820714,
        bits: '1a13ca10',
        difficulty: 847779.0710240941
      };
      var getBlockHeader = sinon.stub().callsArgWith(1, null, {
        result: {
          hash: '0000000000000a817cd3a74aec2f2246b59eb2cbb1ad730213e6c4a1d68ec2f6',
          version: 536870912,
          confirmations: 5,
          height: 828781,
          chainwork: '00000000000000000000000000000000000000000000000ad467352c93bc6a3b',
          previousblockhash: '0000000000000504235b2aff578a48470dbf6b94dafa9b3703bbf0ed554c9dd9',
          nextblockhash: '00000000000000eedd967ec155f237f033686f0924d574b946caf1b0e89551b8',
          merkleroot: '124e0f3fb5aa268f102b0447002dd9700988fc570efcb3e0b5b396ac7db437a9',
          time: 1462979126,
          mediantime: 1462976771,
          nonce: 2981820714,
          bits: '1a13ca10',
          difficulty: 847779.0710240941
        }
      });
      var getBlockHash = sinon.stub().callsArgWith(1, null, {
        result: blockhash
      });
      auroracoind.nodes.push({
        client: {
          getBlockHeader: getBlockHeader,
          getBlockHash: getBlockHash
        }
      });
      auroracoind.getBlockHeader(0, function(err, blockHeader) {
        should.not.exist(err);
        getBlockHeader.args[0][0].should.equal(blockhash);
        blockHeader.should.deep.equal(result);
      });
    });
    it('will give result from client getblockheader (from hash)', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var result = {
        hash: '0000000000000a817cd3a74aec2f2246b59eb2cbb1ad730213e6c4a1d68ec2f6',
        version: 536870912,
        confirmations: 5,
        height: 828781,
        chainWork: '00000000000000000000000000000000000000000000000ad467352c93bc6a3b',
        prevHash: '0000000000000504235b2aff578a48470dbf6b94dafa9b3703bbf0ed554c9dd9',
        nextHash: '00000000000000eedd967ec155f237f033686f0924d574b946caf1b0e89551b8',
        merkleRoot: '124e0f3fb5aa268f102b0447002dd9700988fc570efcb3e0b5b396ac7db437a9',
        time: 1462979126,
        medianTime: 1462976771,
        nonce: 2981820714,
        bits: '1a13ca10',
        difficulty: 847779.0710240941
      };
      var getBlockHeader = sinon.stub().callsArgWith(1, null, {
        result: {
          hash: '0000000000000a817cd3a74aec2f2246b59eb2cbb1ad730213e6c4a1d68ec2f6',
          version: 536870912,
          confirmations: 5,
          height: 828781,
          chainwork: '00000000000000000000000000000000000000000000000ad467352c93bc6a3b',
          previousblockhash: '0000000000000504235b2aff578a48470dbf6b94dafa9b3703bbf0ed554c9dd9',
          nextblockhash: '00000000000000eedd967ec155f237f033686f0924d574b946caf1b0e89551b8',
          merkleroot: '124e0f3fb5aa268f102b0447002dd9700988fc570efcb3e0b5b396ac7db437a9',
          time: 1462979126,
          mediantime: 1462976771,
          nonce: 2981820714,
          bits: '1a13ca10',
          difficulty: 847779.0710240941
        }
      });
      var getBlockHash = sinon.stub();
      auroracoind.nodes.push({
        client: {
          getBlockHeader: getBlockHeader,
          getBlockHash: getBlockHash
        }
      });
      auroracoind.getBlockHeader(blockhash, function(err, blockHeader) {
        should.not.exist(err);
        getBlockHash.callCount.should.equal(0);
        blockHeader.should.deep.equal(result);
      });
    });
  });

  describe('#_maybeGetBlockHash', function() {
    it('will not get block hash with an address', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlockHash = sinon.stub();
      auroracoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      auroracoind._maybeGetBlockHash('2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br', function(err, hash) {
        if (err) {
          return done(err);
        }
        getBlockHash.callCount.should.equal(0);
        hash.should.equal('2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br');
        done();
      });
    });
    it('will not get block hash with non zero-nine numeric string', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlockHash = sinon.stub();
      auroracoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      auroracoind._maybeGetBlockHash('109a', function(err, hash) {
        if (err) {
          return done(err);
        }
        getBlockHash.callCount.should.equal(0);
        hash.should.equal('109a');
        done();
      });
    });
    it('will get the block hash if argument is a number', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlockHash = sinon.stub().callsArgWith(1, null, {
        result: 'blockhash'
      });
      auroracoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      auroracoind._maybeGetBlockHash(10, function(err, hash) {
        if (err) {
          return done(err);
        }
        hash.should.equal('blockhash');
        getBlockHash.callCount.should.equal(1);
        done();
      });
    });
    it('will get the block hash if argument is a number (as string)', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlockHash = sinon.stub().callsArgWith(1, null, {
        result: 'blockhash'
      });
      auroracoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      auroracoind._maybeGetBlockHash('10', function(err, hash) {
        if (err) {
          return done(err);
        }
        hash.should.equal('blockhash');
        getBlockHash.callCount.should.equal(1);
        done();
      });
    });
    it('will try multiple nodes if one fails', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlockHash = sinon.stub().callsArgWith(1, null, {
        result: 'blockhash'
      });
      getBlockHash.onCall(0).callsArgWith(1, {code: -1, message: 'test'});
      auroracoind.tryAllInterval = 1;
      auroracoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      auroracoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      auroracoind._maybeGetBlockHash(10, function(err, hash) {
        if (err) {
          return done(err);
        }
        hash.should.equal('blockhash');
        getBlockHash.callCount.should.equal(2);
        done();
      });
    });
    it('will give error from getBlockHash', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlockHash = sinon.stub().callsArgWith(1, {code: -1, message: 'test'});
      auroracoind.tryAllInterval = 1;
      auroracoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      auroracoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      auroracoind._maybeGetBlockHash(10, function(err, hash) {
        getBlockHash.callCount.should.equal(2);
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        err.code.should.equal(-1);
        done();
      });
    });
  });

  describe('#getBlockOverview', function() {
    var blockhash = '00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b';
    it('will handle error from maybeGetBlockHash', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind._maybeGetBlockHash = sinon.stub().callsArgWith(1, new Error('test'));
      auroracoind.getBlockOverview(blockhash, function(err) {
        err.should.be.instanceOf(Error);
        done();
      });
    });
    it('will give error from client.getBlock', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBlock = sinon.stub().callsArgWith(2, {code: -1, message: 'test'});
      auroracoind.nodes.push({
        client: {
          getBlock: getBlock
        }
      });
      auroracoind.getBlockOverview(blockhash, function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will give expected result', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var blockResult = {
        hash: blockhash,
        version: 536870912,
        confirmations: 5,
        height: 828781,
        chainwork: '00000000000000000000000000000000000000000000000ad467352c93bc6a3b',
        previousblockhash: '0000000000000504235b2aff578a48470dbf6b94dafa9b3703bbf0ed554c9dd9',
        nextblockhash: '00000000000000eedd967ec155f237f033686f0924d574b946caf1b0e89551b8',
        merkleroot: '124e0f3fb5aa268f102b0447002dd9700988fc570efcb3e0b5b396ac7db437a9',
        time: 1462979126,
        mediantime: 1462976771,
        nonce: 2981820714,
        bits: '1a13ca10',
        difficulty: 847779.0710240941
      };
      var getBlock = sinon.stub().callsArgWith(2, null, {
        result: blockResult
      });
      auroracoind.nodes.push({
        client: {
          getBlock: getBlock
        }
      });
      function checkBlock(blockOverview) {
        blockOverview.hash.should.equal('00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b');
        blockOverview.version.should.equal(536870912);
        blockOverview.confirmations.should.equal(5);
        blockOverview.height.should.equal(828781);
        blockOverview.chainWork.should.equal('00000000000000000000000000000000000000000000000ad467352c93bc6a3b');
        blockOverview.prevHash.should.equal('0000000000000504235b2aff578a48470dbf6b94dafa9b3703bbf0ed554c9dd9');
        blockOverview.nextHash.should.equal('00000000000000eedd967ec155f237f033686f0924d574b946caf1b0e89551b8');
        blockOverview.merkleRoot.should.equal('124e0f3fb5aa268f102b0447002dd9700988fc570efcb3e0b5b396ac7db437a9');
        blockOverview.time.should.equal(1462979126);
        blockOverview.medianTime.should.equal(1462976771);
        blockOverview.nonce.should.equal(2981820714);
        blockOverview.bits.should.equal('1a13ca10');
        blockOverview.difficulty.should.equal(847779.0710240941);
      }
      auroracoind.getBlockOverview(blockhash, function(err, blockOverview) {
        if (err) {
          return done(err);
        }
        checkBlock(blockOverview);
        auroracoind.getBlockOverview(blockhash, function(err, blockOverview) {
          checkBlock(blockOverview);
          getBlock.callCount.should.equal(1);
          done();
        });
      });
    });
  });

  describe('#estimateFee', function() {
    it('will give rpc error', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var estimateFee = sinon.stub().callsArgWith(1, {message: 'error', code: -1});
      auroracoind.nodes.push({
        client: {
          estimateFee: estimateFee
        }
      });
      auroracoind.estimateFee(1, function(err) {
        should.exist(err);
        err.should.be.an.instanceof(errors.RPCError);
        done();
      });
    });
    it('will call client estimateFee and give result', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var estimateFee = sinon.stub().callsArgWith(1, null, {
        result: -1
      });
      auroracoind.nodes.push({
        client: {
          estimateFee: estimateFee
        }
      });
      auroracoind.estimateFee(1, function(err, feesPerKb) {
        if (err) {
          return done(err);
        }
        feesPerKb.should.equal(-1);
        done();
      });
    });
  });

  describe('#sendTransaction', function(done) {
    var tx = bitcore.Transaction(txhex);
    it('will give rpc error', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var sendRawTransaction = sinon.stub().callsArgWith(2, {message: 'error', code: -1});
      auroracoind.nodes.push({
        client: {
          sendRawTransaction: sendRawTransaction
        }
      });
      auroracoind.sendTransaction(txhex, function(err) {
        should.exist(err);
        err.should.be.an.instanceof(errors.RPCError);
      });
    });
    it('will send to client and get hash', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var sendRawTransaction = sinon.stub().callsArgWith(2, null, {
        result: tx.hash
      });
      auroracoind.nodes.push({
        client: {
          sendRawTransaction: sendRawTransaction
        }
      });
      auroracoind.sendTransaction(txhex, function(err, hash) {
        if (err) {
          return done(err);
        }
        hash.should.equal(tx.hash);
      });
    });
    it('will send to client with absurd fees and get hash', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var sendRawTransaction = sinon.stub().callsArgWith(2, null, {
        result: tx.hash
      });
      auroracoind.nodes.push({
        client: {
          sendRawTransaction: sendRawTransaction
        }
      });
      auroracoind.sendTransaction(txhex, {allowAbsurdFees: true}, function(err, hash) {
        if (err) {
          return done(err);
        }
        hash.should.equal(tx.hash);
      });
    });
    it('missing callback will throw error', function() {
      var auroracoind = new AuroracoinService(baseConfig);
      var sendRawTransaction = sinon.stub().callsArgWith(2, null, {
        result: tx.hash
      });
      auroracoind.nodes.push({
        client: {
          sendRawTransaction: sendRawTransaction
        }
      });
      var transaction = bitcore.Transaction();
      (function() {
        auroracoind.sendTransaction(transaction);
      }).should.throw(Error);
    });
  });

  describe('#getRawTransaction', function() {
    it('will give rpc error', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getRawTransaction = sinon.stub().callsArgWith(1, {message: 'error', code: -1});
      auroracoind.nodes.push({
        client: {
          getRawTransaction: getRawTransaction
        }
      });
      auroracoind.getRawTransaction('txid', function(err) {
        should.exist(err);
        err.should.be.an.instanceof(errors.RPCError);
        done();
      });
    });
    it('will try all nodes', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.tryAllInterval = 1;
      var getRawTransactionWithError = sinon.stub().callsArgWith(1, {message: 'error', code: -1});
      var getRawTransaction = sinon.stub().callsArgWith(1, null, {
        result: txhex
      });
      auroracoind.nodes.push({
        client: {
          getRawTransaction: getRawTransactionWithError
        }
      });
      auroracoind.nodes.push({
        client: {
          getRawTransaction: getRawTransactionWithError
        }
      });
      auroracoind.nodes.push({
        client: {
          getRawTransaction: getRawTransaction
        }
      });
      auroracoind.getRawTransaction('txid', function(err, tx) {
        if (err) {
          return done(err);
        }
        should.exist(tx);
        tx.should.be.an.instanceof(Buffer);
        done();
      });
    });
    it('will get from cache', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getRawTransaction = sinon.stub().callsArgWith(1, null, {
        result: txhex
      });
      auroracoind.nodes.push({
        client: {
          getRawTransaction: getRawTransaction
        }
      });
      auroracoind.getRawTransaction('txid', function(err, tx) {
        if (err) {
          return done(err);
        }
        should.exist(tx);
        tx.should.be.an.instanceof(Buffer);

        auroracoind.getRawTransaction('txid', function(err, tx) {
          should.exist(tx);
          tx.should.be.an.instanceof(Buffer);
          getRawTransaction.callCount.should.equal(1);
          done();
        });
      });
    });
  });

  describe('#getTransaction', function() {
    it('will give rpc error', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getRawTransaction = sinon.stub().callsArgWith(1, {message: 'error', code: -1});
      auroracoind.nodes.push({
        client: {
          getRawTransaction: getRawTransaction
        }
      });
      auroracoind.getTransaction('txid', function(err) {
        should.exist(err);
        err.should.be.an.instanceof(errors.RPCError);
        done();
      });
    });
    it('will try all nodes', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.tryAllInterval = 1;
      var getRawTransactionWithError = sinon.stub().callsArgWith(1, {message: 'error', code: -1});
      var getRawTransaction = sinon.stub().callsArgWith(1, null, {
        result: txhex
      });
      auroracoind.nodes.push({
        client: {
          getRawTransaction: getRawTransactionWithError
        }
      });
      auroracoind.nodes.push({
        client: {
          getRawTransaction: getRawTransactionWithError
        }
      });
      auroracoind.nodes.push({
        client: {
          getRawTransaction: getRawTransaction
        }
      });
      auroracoind.getTransaction('txid', function(err, tx) {
        if (err) {
          return done(err);
        }
        should.exist(tx);
        tx.should.be.an.instanceof(bitcore.Transaction);
        done();
      });
    });
    it('will get from cache', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getRawTransaction = sinon.stub().callsArgWith(1, null, {
        result: txhex
      });
      auroracoind.nodes.push({
        client: {
          getRawTransaction: getRawTransaction
        }
      });
      auroracoind.getTransaction('txid', function(err, tx) {
        if (err) {
          return done(err);
        }
        should.exist(tx);
        tx.should.be.an.instanceof(bitcore.Transaction);

        auroracoind.getTransaction('txid', function(err, tx) {
          should.exist(tx);
          tx.should.be.an.instanceof(bitcore.Transaction);
          getRawTransaction.callCount.should.equal(1);
          done();
        });

      });
    });
  });

  describe('#getDetailedTransaction', function() {
    var txBuffer = new Buffer('01000000016f95980911e01c2c664b3e78299527a47933aac61a515930a8fe0213d1ac9abe01000000da0047304402200e71cda1f71e087c018759ba3427eb968a9ea0b1decd24147f91544629b17b4f0220555ee111ed0fc0f751ffebf097bdf40da0154466eb044e72b6b3dcd5f06807fa01483045022100c86d6c8b417bff6cc3bbf4854c16bba0aaca957e8f73e19f37216e2b06bb7bf802205a37be2f57a83a1b5a8cc511dc61466c11e9ba053c363302e7b99674be6a49fc0147522102632178d046673c9729d828cfee388e121f497707f810c131e0d3fc0fe0bd66d62103a0951ec7d3a9da9de171617026442fcd30f34d66100fab539853b43f508787d452aeffffffff0240420f000000000017a9148a31d53a448c18996e81ce67811e5fb7da21e4468738c9d6f90000000017a9148ce5408cfeaddb7ccb2545ded41ef478109454848700000000', 'hex');
    var info = {
      blockHash: '00000000000ec715852ea2ecae4dc8563f62d603c820f81ac284cd5be0a944d6',
      height: 530482,
      timestamp: 1439559434000,
      buffer: txBuffer
    };
    var rpcRawTransaction = {
      hex: txBuffer.toString('hex'),
      blockhash: info.blockHash,
      height: info.height,
      version: 1,
      locktime: 411451,
      time: info.timestamp,
      vin: [
        {
          valueSat: 110,
          address: 'mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW',
          txid: '3d003413c13eec3fa8ea1fe8bbff6f40718c66facffe2544d7516c9e2900cac2',
          sequence: 0xFFFFFFFF,
          vout: 0,
          scriptSig: {
            hex: 'scriptSigHex',
            asm: 'scriptSigAsm'
          }
        }
      ],
      vout: [
        {
          spentTxId: '4316b98e7504073acd19308b4b8c9f4eeb5e811455c54c0ebfe276c0b1eb6315',
          spentIndex: 2,
          spentHeight: 100,
          valueSat: 100,
          scriptPubKey: {
            hex: '76a9140b2f0a0c31bfe0406b0ccc1381fdbe311946dadc88ac',
            asm: 'OP_DUP OP_HASH160 0b2f0a0c31bfe0406b0ccc1381fdbe311946dadc OP_EQUALVERIFY OP_CHECKSIG',
            addresses: ['mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW']
          }
        }
      ]
    };
    it('should give a transaction with height and timestamp', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.nodes.push({
        client: {
          getRawTransaction: sinon.stub().callsArgWith(2, {code: -1, message: 'Test error'})
        }
      });
      var txid = '2d950d00494caf6bfc5fff2a3f839f0eb50f663ae85ce092bc5f9d45296ae91f';
      auroracoind.getDetailedTransaction(txid, function(err) {
        should.exist(err);
        err.should.be.instanceof(errors.RPCError);
        done();
      });
    });
    it('should give a transaction with all properties', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getRawTransaction = sinon.stub().callsArgWith(2, null, {
        result: rpcRawTransaction
      });
      auroracoind.nodes.push({
        client: {
          getRawTransaction: getRawTransaction
        }
      });
      var txid = '2d950d00494caf6bfc5fff2a3f839f0eb50f663ae85ce092bc5f9d45296ae91f';
      function checkTx(tx) {
        /* jshint maxstatements: 30 */
        should.exist(tx);
        should.not.exist(tx.coinbase);
        should.equal(tx.hex, txBuffer.toString('hex'));
        should.equal(tx.blockHash, '00000000000ec715852ea2ecae4dc8563f62d603c820f81ac284cd5be0a944d6');
        should.equal(tx.height, 530482);
        should.equal(tx.blockTimestamp, 1439559434000);
        should.equal(tx.version, 1);
        should.equal(tx.locktime, 411451);
        should.equal(tx.feeSatoshis, 10);
        should.equal(tx.inputSatoshis, 110);
        should.equal(tx.outputSatoshis, 100);
        should.equal(tx.hash, txid);
        var input = tx.inputs[0];
        should.equal(input.prevTxId, '3d003413c13eec3fa8ea1fe8bbff6f40718c66facffe2544d7516c9e2900cac2');
        should.equal(input.outputIndex, 0);
        should.equal(input.satoshis, 110);
        should.equal(input.sequence, 0xFFFFFFFF);
        should.equal(input.script, 'scriptSigHex');
        should.equal(input.scriptAsm, 'scriptSigAsm');
        should.equal(input.address, 'mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW');
        var output = tx.outputs[0];
        should.equal(output.satoshis, 100);
        should.equal(output.script, '76a9140b2f0a0c31bfe0406b0ccc1381fdbe311946dadc88ac');
        should.equal(output.scriptAsm, 'OP_DUP OP_HASH160 0b2f0a0c31bfe0406b0ccc1381fdbe311946dadc OP_EQUALVERIFY OP_CHECKSIG');
        should.equal(output.address, 'mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW');
        should.equal(output.spentTxId, '4316b98e7504073acd19308b4b8c9f4eeb5e811455c54c0ebfe276c0b1eb6315');
        should.equal(output.spentIndex, 2);
        should.equal(output.spentHeight, 100);
      }
      auroracoind.getDetailedTransaction(txid, function(err, tx) {
        if (err) {
          return done(err);
        }
        checkTx(tx);
        auroracoind.getDetailedTransaction(txid, function(err, tx) {
          if (err) {
            return done(err);
          }
          checkTx(tx);
          getRawTransaction.callCount.should.equal(1);
          done();
        });
      });
    });
    it('should set coinbase to true', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var rawTransaction = JSON.parse((JSON.stringify(rpcRawTransaction)));
      delete rawTransaction.vin[0];
      rawTransaction.vin = [
        {
          coinbase: 'abcdef'
        }
      ];
      auroracoind.nodes.push({
        client: {
          getRawTransaction: sinon.stub().callsArgWith(2, null, {
            result: rawTransaction
          })
        }
      });
      var txid = '2d950d00494caf6bfc5fff2a3f839f0eb50f663ae85ce092bc5f9d45296ae91f';
      auroracoind.getDetailedTransaction(txid, function(err, tx) {
        should.exist(tx);
        should.equal(tx.coinbase, true);
        done();
      });
    });
    it('will not include address if address length is zero', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var rawTransaction = JSON.parse((JSON.stringify(rpcRawTransaction)));
      rawTransaction.vout[0].scriptPubKey.addresses = [];
      auroracoind.nodes.push({
        client: {
          getRawTransaction: sinon.stub().callsArgWith(2, null, {
            result: rawTransaction
          })
        }
      });
      var txid = '2d950d00494caf6bfc5fff2a3f839f0eb50f663ae85ce092bc5f9d45296ae91f';
      auroracoind.getDetailedTransaction(txid, function(err, tx) {
        should.exist(tx);
        should.equal(tx.outputs[0].address, null);
        done();
      });
    });
    it('will not include address if address length is greater than 1', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var rawTransaction = JSON.parse((JSON.stringify(rpcRawTransaction)));
      rawTransaction.vout[0].scriptPubKey.addresses = ['one', 'two'];
      auroracoind.nodes.push({
        client: {
          getRawTransaction: sinon.stub().callsArgWith(2, null, {
            result: rawTransaction
          })
        }
      });
      var txid = '2d950d00494caf6bfc5fff2a3f839f0eb50f663ae85ce092bc5f9d45296ae91f';
      auroracoind.getDetailedTransaction(txid, function(err, tx) {
        should.exist(tx);
        should.equal(tx.outputs[0].address, null);
        done();
      });
    });
    it('will handle scriptPubKey.addresses not being set', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var rawTransaction = JSON.parse((JSON.stringify(rpcRawTransaction)));
      delete rawTransaction.vout[0].scriptPubKey['addresses'];
      auroracoind.nodes.push({
        client: {
          getRawTransaction: sinon.stub().callsArgWith(2, null, {
            result: rawTransaction
          })
        }
      });
      var txid = '2d950d00494caf6bfc5fff2a3f839f0eb50f663ae85ce092bc5f9d45296ae91f';
      auroracoind.getDetailedTransaction(txid, function(err, tx) {
        should.exist(tx);
        should.equal(tx.outputs[0].address, null);
        done();
      });
    });
    it('will not include script if input missing scriptSig or coinbase', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var rawTransaction = JSON.parse((JSON.stringify(rpcRawTransaction)));
      delete rawTransaction.vin[0].scriptSig;
      delete rawTransaction.vin[0].coinbase;
      auroracoind.nodes.push({
        client: {
          getRawTransaction: sinon.stub().callsArgWith(2, null, {
            result: rawTransaction
          })
        }
      });
      var txid = '2d950d00494caf6bfc5fff2a3f839f0eb50f663ae85ce092bc5f9d45296ae91f';
      auroracoind.getDetailedTransaction(txid, function(err, tx) {
        should.exist(tx);
        should.equal(tx.inputs[0].script, null);
        done();
      });
    });
    it('will set height to -1 if missing height', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var rawTransaction = JSON.parse((JSON.stringify(rpcRawTransaction)));
      delete rawTransaction.height;
      auroracoind.nodes.push({
        client: {
          getRawTransaction: sinon.stub().callsArgWith(2, null, {
            result: rawTransaction
          })
        }
      });
      var txid = '2d950d00494caf6bfc5fff2a3f839f0eb50f663ae85ce092bc5f9d45296ae91f';
      auroracoind.getDetailedTransaction(txid, function(err, tx) {
        should.exist(tx);
        should.equal(tx.height, -1);
        done();
      });
    });
  });

  describe('#getBestBlockHash', function() {
    it('will give rpc error', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, {message: 'error', code: -1});
      auroracoind.nodes.push({
        client: {
          getBestBlockHash: getBestBlockHash
        }
      });
      auroracoind.getBestBlockHash(function(err) {
        should.exist(err);
        err.should.be.an.instanceof(errors.RPCError);
        done();
      });
    });
    it('will call client getInfo and give result', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, null, {
        result: 'besthash'
      });
      auroracoind.nodes.push({
        client: {
          getBestBlockHash: getBestBlockHash
        }
      });
      auroracoind.getBestBlockHash(function(err, hash) {
        if (err) {
          return done(err);
        }
        should.exist(hash);
        hash.should.equal('besthash');
        done();
      });
    });
  });

  describe('#getSpentInfo', function() {
    it('will give rpc error', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getSpentInfo = sinon.stub().callsArgWith(1, {message: 'error', code: -1});
      auroracoind.nodes.push({
        client: {
          getSpentInfo: getSpentInfo
        }
      });
      auroracoind.getSpentInfo({}, function(err) {
        should.exist(err);
        err.should.be.an.instanceof(errors.RPCError);
        done();
      });
    });
    it('will empty object when not found', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getSpentInfo = sinon.stub().callsArgWith(1, {message: 'test', code: -5});
      auroracoind.nodes.push({
        client: {
          getSpentInfo: getSpentInfo
        }
      });
      auroracoind.getSpentInfo({}, function(err, info) {
        should.not.exist(err);
        info.should.deep.equal({});
        done();
      });
    });
    it('will call client getSpentInfo and give result', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getSpentInfo = sinon.stub().callsArgWith(1, null, {
        result: {
          txid: 'txid',
          index: 10,
          height: 101
        }
      });
      auroracoind.nodes.push({
        client: {
          getSpentInfo: getSpentInfo
        }
      });
      auroracoind.getSpentInfo({}, function(err, info) {
        if (err) {
          return done(err);
        }
        info.txid.should.equal('txid');
        info.index.should.equal(10);
        info.height.should.equal(101);
        done();
      });
    });
  });

  describe('#getInfo', function() {
    it('will give rpc error', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var getInfo = sinon.stub().callsArgWith(0, {message: 'error', code: -1});
      auroracoind.nodes.push({
        client: {
          getInfo: getInfo
        }
      });
      auroracoind.getInfo(function(err) {
        should.exist(err);
        err.should.be.an.instanceof(errors.RPCError);
        done();
      });
    });
    it('will call client getInfo and give result', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.node.getNetworkName = sinon.stub().returns('testnet');
      var getInfo = sinon.stub().callsArgWith(0, null, {
        result: {
          version: 1,
          protocolversion: 1,
          blocks: 1,
          timeoffset: 1,
          connections: 1,
          proxy: '',
          difficulty: 1,
          testnet: true,
          relayfee: 10,
          errors: ''
        }
      });
      auroracoind.nodes.push({
        client: {
          getInfo: getInfo
        }
      });
      auroracoind.getInfo(function(err, info) {
        if (err) {
          return done(err);
        }
        should.exist(info);
        should.equal(info.version, 1);
        should.equal(info.protocolVersion, 1);
        should.equal(info.blocks, 1);
        should.equal(info.timeOffset, 1);
        should.equal(info.connections, 1);
        should.equal(info.proxy, '');
        should.equal(info.difficulty, 1);
        should.equal(info.testnet, true);
        should.equal(info.relayFee, 10);
        should.equal(info.errors, '');
        info.network.should.equal('testnet');
        done();
      });
    });
  });

  describe('#generateBlock', function() {
    it('will give rpc error', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var generate = sinon.stub().callsArgWith(1, {message: 'error', code: -1});
      auroracoind.nodes.push({
        client: {
          generate: generate
        }
      });
      auroracoind.generateBlock(10, function(err) {
        should.exist(err);
        err.should.be.an.instanceof(errors.RPCError);
        done();
      });
    });
    it('will call client generate and give result', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      var generate = sinon.stub().callsArgWith(1, null, {
        result: ['hash']
      });
      auroracoind.nodes.push({
        client: {
          generate: generate
        }
      });
      auroracoind.generateBlock(10, function(err, hashes) {
        if (err) {
          return done(err);
        }
        hashes.length.should.equal(1);
        hashes[0].should.equal('hash');
        done();
      });
    });
  });

  describe('#stop', function() {
    it('will callback if spawn is not set', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.stop(done);
    });
    it('will exit spawned process', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.spawn = {};
      auroracoind.spawn.process = new EventEmitter();
      auroracoind.spawn.process.kill = sinon.stub();
      auroracoind.stop(done);
      auroracoind.spawn.process.kill.callCount.should.equal(1);
      auroracoind.spawn.process.kill.args[0][0].should.equal('SIGINT');
      auroracoind.spawn.process.emit('exit', 0);
    });
    it('will give error with non-zero exit status code', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.spawn = {};
      auroracoind.spawn.process = new EventEmitter();
      auroracoind.spawn.process.kill = sinon.stub();
      auroracoind.stop(function(err) {
        err.should.be.instanceof(Error);
        err.code.should.equal(1);
        done();
      });
      auroracoind.spawn.process.kill.callCount.should.equal(1);
      auroracoind.spawn.process.kill.args[0][0].should.equal('SIGINT');
      auroracoind.spawn.process.emit('exit', 1);
    });
    it('will stop after timeout', function(done) {
      var auroracoind = new AuroracoinService(baseConfig);
      auroracoind.shutdownTimeout = 300;
      auroracoind.spawn = {};
      auroracoind.spawn.process = new EventEmitter();
      auroracoind.spawn.process.kill = sinon.stub();
      auroracoind.stop(function(err) {
        err.should.be.instanceof(Error);
        done();
      });
      auroracoind.spawn.process.kill.callCount.should.equal(1);
      auroracoind.spawn.process.kill.args[0][0].should.equal('SIGINT');
    });
  });

});
