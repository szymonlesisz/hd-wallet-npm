'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.WorkerDiscoveryHandler = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _stream = require('../../../utils/stream');

var _channel = require('./channel');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var WorkerDiscoveryHandler = exports.WorkerDiscoveryHandler = function () {
    function WorkerDiscoveryHandler(f, blockchain, addressSources, network) {
        var _this = this;

        _classCallCheck(this, WorkerDiscoveryHandler);

        this.counter = new TransactionCounter();

        this.blockchain = blockchain;
        this.addressSources = addressSources;

        this.workerChannel = new _channel.WorkerChannel(f, function (r) {
            return _this.getPromise(r);
        }, function (r) {
            return _this.getStream(r);
        });
        this.network = network;
    }

    _createClass(WorkerDiscoveryHandler, [{
        key: 'discovery',
        value: function discovery(ai, xpub, segwit) {
            var _this2 = this;

            // $FlowIssue
            var webassembly = typeof WebAssembly !== 'undefined';
            this.workerChannel.postToWorker({ type: 'init', state: ai, network: this.network, webassembly: webassembly, xpub: xpub, segwit: segwit });
            this.workerChannel.postToWorker({ type: 'startDiscovery' });

            var promise = this.workerChannel.resPromise(function () {
                return _this2.counter.finisher.emit();
            });

            var stream = this.counter.stream;

            var res = _stream.StreamWithEnding.fromStreamAndPromise(stream, promise);
            return res;
        }
    }, {
        key: 'getStream',
        value: function getStream(p) {
            if (p.type === 'chunkTransactions') {
                var source = this.addressSources[p.chainId];
                if (p.chainId === 0) {
                    this.counter.setCount(p.pseudoCount);
                }
                return this.getChunkStream(source, p.firstIndex, p.lastIndex, p.startBlock, p.endBlock, p.chainId === 0, p.addresses);
            }
            return _stream.Stream.simple('Unknown request ' + p.type);
        }
    }, {
        key: 'getPromise',
        value: function getPromise(p) {
            if (p.type === 'lookupBlockHash') {
                return this.blockchain.lookupBlockHash(p.height);
            }
            if (p.type === 'lookupSyncStatus') {
                return this.blockchain.lookupSyncStatus().then(function (_ref) {
                    var height = _ref.height;
                    return height;
                });
            }
            if (p.type === 'doesTransactionExist') {
                return this.blockchain.lookupTransaction(p.txid).then(function () {
                    return true;
                }, function () {
                    return false;
                });
            }
            return Promise.reject(new Error('Unknown request ' + p.type));
        }
    }, {
        key: 'getChunkStream',
        value: function getChunkStream(source, firstIndex, lastIndex, startBlock, endBlock, add, addresses) {
            var _this3 = this;

            var addressPromise = WorkerDiscoveryHandler.deriveAddresses(source, addresses, firstIndex, lastIndex);

            return _stream.Stream.fromPromise(addressPromise.then(function (addresses) {
                return _this3.blockchain.lookupTransactionsStream(addresses, endBlock, startBlock).map(function (transactions) {
                    if (transactions instanceof Error) {
                        return transactions.message;
                    } else {
                        _this3.counter.setCount(_this3.counter.count + transactions.length);
                        var ci = {
                            transactions: transactions, addresses: addresses
                        };
                        return ci;
                    }
                });
            }));
        }
    }], [{
        key: 'deriveAddresses',
        value: function deriveAddresses(source, addresses, firstIndex, lastIndex) {
            if (addresses == null) {
                if (source == null) {
                    return Promise.reject(new Error('Cannot derive addresses in worker without webassembly'));
                } else {
                    return source.derive(firstIndex, lastIndex);
                }
            } else {
                return Promise.resolve(addresses);
            }
        }
    }]);

    return WorkerDiscoveryHandler;
}();

var TransactionCounter = function () {
    function TransactionCounter() {
        _classCallCheck(this, TransactionCounter);

        this.count = 0;
        this.emitter = new _stream.Emitter();
        this.finisher = new _stream.Emitter();
        this.stream = _stream.Stream.fromEmitterFinish(this.emitter, this.finisher, function () {});
    }

    _createClass(TransactionCounter, [{
        key: 'setCount',
        value: function setCount(i) {
            if (i > this.count) {
                this.count = i;
                this.emitter.emit({ transactions: this.count });
            }
        }
    }]);

    return TransactionCounter;
}();