// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var stream = require('stream');
var EventEmitter = require('events').EventEmitter;
var FakeTransport = require('./fake_transport.js');
var Message = require('azure-iot-common').Message;
var errors = require('azure-iot-common').errors;
var results = require('azure-iot-common').results;
var X509AuthenticationProvider = require('../lib/x509_authentication_provider').X509AuthenticationProvider;
var Client = require('../lib/device_client').Client;

describe('Device Client', function () {
  var sharedKeyConnectionString = 'HostName=host;DeviceId=id;SharedAccessKey=key';
  var sharedAccessSignature = '"SharedAccessSignature sr=hubName.azure-devices.net/devices/deviceId&sig=s1gn4tur3&se=1454204843"';

  describe('#constructor', function () {
    it('throws if a connection string is passed', function () {
      assert.throws(function () {
        return new Client(EventEmitter, 'fakeconnectionstring');
      }, errors.InvalidOperationError);
    });
  });

  describe('#fromConnectionString', function () {
    /*Tests_SRS_NODE_DEVICE_CLIENT_05_006: [The fromConnectionString method shall return a new instance of the Client object, as by a call to new Client(new Transport(...)).]*/
    it('returns an instance of Client', function () {
      var client = Client.fromConnectionString(sharedKeyConnectionString, FakeTransport);
      assert.instanceOf(client, Client);
    });

    it('doesn\'t try to renew the SAS token when using x509', function (testCallback) {
      this.clock = sinon.useFakeTimers();
      var clock = this.clock;

      var x509ConnectionString = 'HostName=host;DeviceId=id;x509=true';
      var client = new Client.fromConnectionString(x509ConnectionString, FakeTransport);
      assert.instanceOf(client, Client);

      sinon.stub(client._transport, 'updateSharedAccessSignature').callsFake(function () {
        clock.restore();
        testCallback(new Error('updateSharedAccessSignature should not have been called'));
      });

      this.clock.tick(3600000); // 1 hour: this should trigger the call to renew the SAS token.
      clock.restore();
      testCallback();
    });

    /*Tests_SRS_NODE_DEVICE_CLIENT_16_093: [The `fromConnectionString` method shall create a new `X509AuthorizationProvider` object with the connection string passed as argument if it contains an X509 parameter and pass this object to the transport constructor.]*/
    it('creates a X509AuthenticationProvider and passes it to the transport', function (testCallback) {
      var x509ConnectionString = 'HostName=host;DeviceId=id;x509=true';
      Client.fromConnectionString(x509ConnectionString, function (authProvider) {
        assert.instanceOf(authProvider, X509AuthenticationProvider);
        testCallback();
      });
    });
  });

  describe('#fromSharedAccessSignature', function () {
    /*Tests_SRS_NODE_DEVICE_CLIENT_16_030: [The fromSharedAccessSignature method shall return a new instance of the Client object] */
    it('returns an instance of Client', function () {
      var client = Client.fromSharedAccessSignature(sharedAccessSignature, FakeTransport);
      assert.instanceOf(client, Client);
    });
  });

  describe('#fromAuthenticationProvider', function () {
    /*Tests_SRS_NODE_DEVICE_CLIENT_16_091: [The `fromAuthenticationProvider` method shall return a `Client` object configured with a new instance of a transport created using the `transportCtor` argument.]*/
    it('returns an instance of Client', function () {
      var client = Client.fromAuthenticationProvider({}, FakeTransport);
      assert.instanceOf(client, Client);
    });
  });


  describe('#uploadToBlob', function() {
    /*Tests_SRS_NODE_DEVICE_CLIENT_16_037: [The `uploadToBlob` method shall throw a `ReferenceError` if `blobName` is falsy.]*/
    [undefined, null, ''].forEach(function (blobName) {
      it('throws a ReferenceError if \'blobName\' is ' + blobName + '\'', function() {
        var client = new Client(new EventEmitter(), null, {});
        assert.throws(function() {
          client.uploadToBlob(blobName, new stream.Readable(), 42, function() {});
        });
      });
    });

    /*Tests_SRS_NODE_DEVICE_CLIENT_16_038: [The `uploadToBlob` method shall throw a `ReferenceError` if `stream` is falsy.]*/
    [undefined, null, ''].forEach(function (stream) {
      it('throws a ReferenceError if \'stream\' is ' + stream + '\'', function() {
        var client = new Client(new EventEmitter(), null, {});
        assert.throws(function() {
          client.uploadToBlob('blobName', stream, 42, function() {});
        });
      });
    });

    /*Tests_SRS_NODE_DEVICE_CLIENT_16_039: [The `uploadToBlob` method shall throw a `ReferenceError` if `streamLength` is falsy.]*/
    [undefined, null, '', 0].forEach(function (streamLength) {
      it('throws a ReferenceError if \'streamLength\' is ' + streamLength + '\'', function() {
        var client = new Client(new EventEmitter(), null, {});
        assert.throws(function() {
          client.uploadToBlob('blobName', new stream.Readable(), streamLength, function() {});
        });
      });
    });

    /*Tests_SRS_NODE_DEVICE_CLIENT_16_040: [The `uploadToBlob` method shall call the `done` callback with an `Error` object if the upload fails.]*/
    it('calls the done callback with an Error object if the upload fails', function(done) {
      var FakeBlobUploader = function () {
        this.uploadToBlob = function(blobName, stream, streamLength, callback) {
          callback(new Error('fake error'));
        };
      };

      var client = new Client(new EventEmitter(), null, new FakeBlobUploader());
      client.uploadToBlob('blobName', new stream.Readable(), 42, function(err) {
        assert.instanceOf(err, Error);
        done();
      });
    });

    /*Tests_SRS_NODE_DEVICE_CLIENT_16_041: [The `uploadToBlob` method shall call the `done` callback no parameters if the upload succeeds.]*/
    it('calls the done callback with no parameters if the upload succeeded', function (done) {
      var FakeBlobUploader = function () {
        this.uploadToBlob = function(blobName, stream, streamLength, callback) {
          callback();
        };
      };

      var client = new Client(new EventEmitter(), null, new FakeBlobUploader());
      client.uploadToBlob('blobName', new stream.Readable(), 42, done);
    });
  });

  describe('#on(\'message\')', function () {
    /*Tests_SRS_NODE_DEVICE_CLIENT_16_002: [The ‘message’ event shall be emitted when a cloud-to-device message is received from the IoT Hub service.]*/
    it('emits a message event when a message is received', function (done) {
      var fakeTransport = new FakeTransport();
      var client = new Client(fakeTransport);
      client.on('message', function(msg) {
        /*Tests_SRS_NODE_DEVICE_CLIENT_16_003: [The ‘message’ event parameter shall be a ‘Message’ object.]*/
        assert.equal(msg.constructor.name, 'Message');
        done();
      });

      fakeTransport.emit('message', new Message());
    });

    /*Tests_SRS_NODE_DEVICE_CLIENT_16_004: [The client shall start listening for messages from the service whenever there is a listener subscribed to the ‘message’ event.]*/
    it('starts listening for messages when a listener subscribes to the message event', function () {
      var fakeTransport = new FakeTransport();
      sinon.spy(fakeTransport, 'enableC2D');
      var client = new Client(fakeTransport);

      // Calling 'on' twice to make sure it's called only once on the receiver.
      // It works because the test will fail if the test callback is called multiple times, and it's called for every time the 'message' event is subscribed on the receiver.
      client.on('message', function () { });
      client.on('message', function () { });
      assert.isTrue(fakeTransport.enableC2D.calledOnce);
    });

    /*Tests_SRS_NODE_DEVICE_CLIENT_16_005: [The client shall stop listening for messages from the service whenever the last listener unsubscribes from the ‘message’ event.]*/
    it('stops listening for messages when the last listener has unsubscribed', function (testCallback) {
      var fakeTransport = new FakeTransport();
      sinon.spy(fakeTransport, 'enableC2D');
      sinon.spy(fakeTransport, 'disableC2D');
      sinon.spy(fakeTransport, 'removeAllListeners');

      var client = new Client(fakeTransport);
      var listener1 = function () { };
      var listener2 = function () { };
      client.on('message', listener1);
      client.on('message', listener2);

      process.nextTick(function() {
        client.removeListener('message', listener1);
        assert.isTrue(fakeTransport.disableC2D.notCalled);
        client.removeListener('message', listener2);
        assert(fakeTransport.disableC2D.calledOnce);
        testCallback();
      });
    });

    /*Tests_SRS_NODE_DEVICE_CLIENT_16_066: [ The client shall emit an error if connecting the transport fails while subscribing to message events ]*/
    it('emits an error if it fails to start listening for messages', function (testCallback) {
      var fakeTransport = new FakeTransport();
      var fakeError = new Error('fake');
      sinon.stub(fakeTransport, 'enableC2D').callsFake(function (callback) { callback(fakeError); });
      var client = new Client(fakeTransport);
      client.on('error', function (err) {
        assert.strictEqual(err, fakeError);
        testCallback();
      })

      // Calling 'on' twice to make sure it's called only once on the receiver.
      // It works because the test will fail if the test callback is called multiple times, and it's called for every time the 'message' event is subscribed on the receiver.
      client.on('message', function () { });
      assert.isTrue(fakeTransport.enableC2D.calledOnce);
    });

    /*Tests_SRS_NODE_DEVICE_CLIENT_16_066: [ The client shall emit an error if connecting the transport fails while subscribing to message events ]*/
    it('emits an error if it fails to stop listening for messages', function (testCallback) {
      var fakeTransport = new FakeTransport();
      var fakeError = new Error('fake');
      sinon.spy(fakeTransport, 'enableC2D');
      sinon.stub(fakeTransport, 'disableC2D').callsFake(function (callback) { callback(fakeError); });
      var client = new Client(fakeTransport);
      client.on('error', function (err) {
        assert.strictEqual(err, fakeError);
        testCallback();
      })

      client.on('message', function () { });
      assert.isTrue(fakeTransport.enableC2D.calledOnce);
      client.removeAllListeners('message');
      assert.isTrue(fakeTransport.disableC2D.calledOnce);
    });
  });

  describe('transport.on(\'disconnect\') handler', function () {
    var fakeTransport, fakeRetryPolicy;
    beforeEach(function () {
      fakeRetryPolicy = {
        shouldRetry: function () { return true; },
        nextRetryTimeout: function () { return 1; }
      };

      fakeTransport = new EventEmitter();
      fakeTransport.enableC2D = sinon.stub().callsArg(0);
    });

    /*Tests_SRS_NODE_DEVICE_CLIENT_16_097: [If the transport emits a `disconnect` event while the client is subscribed to c2d messages updates the retry policy shall be used to reconnect and re-enable the feature using the transport `enableC2D` method.]*/
    it('reenables C2D after being disconnected if C2D was enabled', function () {
      var client = new Client(fakeTransport);
      client.setRetryPolicy(fakeRetryPolicy);
      client.on('message', function () {});
      assert.isTrue(fakeTransport.enableC2D.calledOnce);
      fakeTransport.emit('disconnect', new errors.TimeoutError()); // timeouts can be retried
      assert.isTrue(fakeTransport.enableC2D.calledTwice);
    });

    /*Tests_SRS_NODE_DEVICE_CLIENT_16_102: [If the retry policy fails to reestablish the C2D functionality a `disconnect` event shall be emitted with a `results.Disconnected` object.]*/
    it('emits a disconnect event if reenabling C2D fails', function (testCallback) {
      var fakeError = new Error('fake');
      var client = new Client(fakeTransport);
      client.on('disconnect', function (err) {
        assert.instanceOf(err, results.Disconnected);
        assert.strictEqual(err.transportObj, fakeError);
        testCallback();
      });

      client.setRetryPolicy(fakeRetryPolicy);
      client._maxOperationTimeout = 1;
      client.on('message', function () {});
      assert.isTrue(fakeTransport.enableC2D.calledOnce);
      fakeTransport.enableC2D = sinon.stub().callsArgWith(0, fakeError);
      fakeTransport.emit('disconnect', new errors.TimeoutError()); // timeouts can be retried
    });
  });

  describe('#setOptions', function () {
    /*Tests_SRS_NODE_INTERNAL_CLIENT_16_042: [The `setOptions` method shall throw a `ReferenceError` if the options object is falsy.]*/
    [null, undefined].forEach(function (options) {
      it('throws is options is ' + options, function () {
        var client = new Client(new EventEmitter());
        assert.throws(function () {
          client.setOptions(options, function () { });
        }, ReferenceError);
      });
    });

    /*Tests_SRS_NODE_INTERNAL_CLIENT_16_043: [The `done` callback shall be invoked no parameters when it has successfully finished setting the client and/or transport options.]*/
    it('calls the done callback with no parameters when it has successfully configured the transport', function (done) {
      var client = new Client(new FakeTransport());
      client.setOptions({}, done);
    });

    /*Tests_SRS_NODE_INTERNAL_CLIENT_16_044: [The `done` callback shall be invoked with a standard javascript `Error` object and no result object if the client could not be configured as requested.]*/
    it('calls the done callback with an error when it failed to configured the transport', function (done) {
      var failingTransport = new FakeTransport();
      sinon.stub(failingTransport, 'setOptions').callsFake(function (options, done) {
        done(new Error('dummy error'));
      });

      var client = new Client(failingTransport);
      client.setOptions({}, function (err) {
        assert.instanceOf(err, Error);
        done();
      });
    });
  });
});