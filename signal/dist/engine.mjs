import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/ws/lib/constants.js"(exports, module) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module.exports = {
      BINARY_TYPES,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: Symbol("kIsForOnEventAttribute"),
      kListener: Symbol("kListener"),
      kStatusCode: Symbol("status-code"),
      kWebSocket: Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/ws/lib/buffer-util.js"(exports, module) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = __require("bufferutil");
        module.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/ws/lib/limiter.js"(exports, module) {
    "use strict";
    var kDone = Symbol("kDone");
    var kRun = Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module.exports = Limiter;
  }
});

// node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/ws/lib/permessage-deflate.js"(exports, module) {
    "use strict";
    var zlib = __require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = Symbol("permessage-deflate");
    var kTotalLength = Symbol("total-length");
    var kCallback = Symbol("callback");
    var kBuffers = Symbol("buffers");
    var kError = Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       * @param {Boolean} [isServer=false] Create the instance in either server or
       *     client mode
       * @param {Number} [maxPayload=0] The maximum allowed message length
       */
      constructor(options, isServer, maxPayload) {
        this._maxPayload = maxPayload | 0;
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._isServer = !!isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num3 = +value;
                if (!Number.isInteger(num3) || num3 < 8 || num3 > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num3;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num3 = +value;
              if (!Number.isInteger(num3) || num3 < 8 || num3 > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num3;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err2, result) => {
            done();
            callback(err2, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err2, result) => {
            done();
            callback(err2, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err2 = this._inflate[kError];
          if (err2) {
            this._inflate.close();
            this._inflate = null;
            callback(err2);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module.exports = PerMessageDeflate;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err2) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err2[kStatusCode] = 1007;
      this[kCallback](err2);
    }
  }
});

// node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/ws/lib/validation.js"(exports, module) {
    "use strict";
    var { isUtf8 } = __require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = __require("utf-8-validate");
        module.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/ws/lib/receiver.js"(exports, module) {
    "use strict";
    var { Writable } = __require("stream");
    var PerMessageDeflate = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n2) {
        this._bufferedBytes -= n2;
        if (n2 === this._buffers[0].length) return this._buffers.shift();
        if (n2 < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n2,
            buf.length - n2
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n2);
        }
        const dst = Buffer.allocUnsafe(n2);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n2;
          if (n2 >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n2), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n2,
              buf.length - n2
            );
          }
          n2 -= buf.length;
        } while (n2 > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num3 = buf.readUInt32BE(0);
        if (num3 > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num3 * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err2, buf) => {
          if (err2) return cb(err2);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err2 = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err2, this.createError);
        err2.code = errorCode;
        err2[kStatusCode] = statusCode;
        return err2;
      }
    };
    module.exports = Receiver2;
  }
});

// node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/ws/lib/sender.js"(exports, module) {
    "use strict";
    var { Duplex } = __require("stream");
    var { randomFillSync } = __require("crypto");
    var PerMessageDeflate = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else {
            buf.set(data, 2);
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err2 = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err2, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err2) => {
          process.nextTick(onError, this, err2, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err2 = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err2, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module.exports = Sender2;
    function callCallbacks(sender, err2, cb) {
      if (typeof cb === "function") cb(err2);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err2);
      }
    }
    function onError(sender, err2, cb) {
      callCallbacks(sender, err2, cb);
      sender.onerror(err2);
    }
  }
});

// node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/ws/lib/event-target.js"(exports, module) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = Symbol("kCode");
    var kData = Symbol("kData");
    var kError = Symbol("kError");
    var kMessage = Symbol("kMessage");
    var kReason = Symbol("kReason");
    var kTarget = Symbol("kTarget");
    var kType = Symbol("kType");
    var kWasClean = Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/ws/lib/extension.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension) => {
        let configurations = extensions[extension];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module.exports = { format, parse };
  }
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/ws/lib/websocket.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var https = __require("https");
    var http = __require("http");
    var net = __require("net");
    var tls = __require("tls");
    var { randomBytes: randomBytes2, createHash: createHash2 } = __require("crypto");
    var { Duplex, Readable } = __require("stream");
    var { URL: URL2 } = __require("url");
    var PerMessageDeflate = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var closeTimeout = 30 * 1e3;
    var kAborted = Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate.extensionName]) {
          this._extensions[PerMessageDeflate.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err2) => {
          if (err2) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        protocolVersion: protocolVersions[1],
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch (e) {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err2 = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err2;
        } else {
          emitErrorAndClose(websocket, err2);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes2(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate(
          opts.perMessageDeflate !== true ? opts.perMessageDeflate : {},
          false,
          opts.maxPayload
        );
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err2) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err2);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err2 = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err2);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash2("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err2) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
          } catch (err2) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err2) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err2);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err2 = new Error(message);
      Error.captureStackTrace(err2, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err2);
      } else {
        stream.destroy(err2);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err2 = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err2);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err2) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err2[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err2);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err2) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err2);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      let chunk;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && (chunk = websocket._socket.read()) !== null) {
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/ws/lib/stream.js"(exports, module) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = __require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err2) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err2);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err2) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err2);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err2, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err2);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err3) {
          called = true;
          callback(err3);
        });
        ws.once("close", function close() {
          if (!called) callback(err2);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module.exports = createWebSocketStream2;
  }
});

// node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/ws/lib/subprotocol.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module.exports = { parse };
  }
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/ws/lib/websocket-server.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var http = __require("http");
    var { Duplex } = __require("stream");
    var { createHash: createHash2 } = __require("crypto");
    var extension = require_extension();
    var PerMessageDeflate = require_permessage_deflate();
    var subprotocol = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol.parse(secWebSocketProtocol);
          } catch (err2) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate(
            this.options.perMessageDeflate,
            true,
            this.options.maxPayload
          );
          try {
            const offers = extension.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate.extensionName]);
              extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
            }
          } catch (err2) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash2("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate.extensionName]) {
          const params = extensions[PerMessageDeflate.extensionName].params;
          const value = extension.format({
            [PerMessageDeflate.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err2 = new Error(message);
        Error.captureStackTrace(err2, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err2, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// src/node/main.ts
import { randomBytes } from "node:crypto";
import { existsSync as existsSync7, readFileSync as readFileSync8 } from "node:fs";
import { dirname as dirname2, join as join6, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";
import { getHeapStatistics as getHeapStatistics2 } from "node:v8";

// src/core/curve.ts
var LAMPORTS_PER_SOL = 1e9;
var RAW_PER_TOKEN = 1e6;
var CURVE = {
  initialVirtualTok: 1073e12,
  initialVirtualSol: 3e10,
  initialRealTok: 7931e11,
  supply: 1e15
};
var CURVE_COMPLETE_REAL_SOL = (() => {
  const k = CURVE.initialVirtualSol * CURVE.initialVirtualTok;
  const vTokEnd = CURVE.initialVirtualTok - CURVE.initialRealTok;
  return k / vTokEnd - CURVE.initialVirtualSol;
})();
var CURVE_FEES = { protocol: 95, creator: 30, lp: 0 };
var AMM_FEE_TIERS = [
  { mcapSol: 0, fees: { creator: 30, protocol: 93, lp: 2 } },
  { mcapSol: 420, fees: { creator: 95, protocol: 5, lp: 20 } },
  { mcapSol: 1470, fees: { creator: 90, protocol: 5, lp: 20 } },
  { mcapSol: 2460, fees: { creator: 85, protocol: 5, lp: 20 } },
  { mcapSol: 3440, fees: { creator: 80, protocol: 5, lp: 20 } },
  { mcapSol: 4420, fees: { creator: 75, protocol: 5, lp: 20 } },
  { mcapSol: 9820, fees: { creator: 70, protocol: 5, lp: 20 } },
  { mcapSol: 14740, fees: { creator: 65, protocol: 5, lp: 20 } },
  { mcapSol: 19650, fees: { creator: 60, protocol: 5, lp: 20 } },
  { mcapSol: 24560, fees: { creator: 55, protocol: 5, lp: 20 } },
  { mcapSol: 29470, fees: { creator: 50, protocol: 5, lp: 20 } },
  { mcapSol: 34380, fees: { creator: 45, protocol: 5, lp: 20 } },
  { mcapSol: 39300, fees: { creator: 40, protocol: 5, lp: 20 } },
  { mcapSol: 44210, fees: { creator: 35, protocol: 5, lp: 20 } },
  { mcapSol: 49120, fees: { creator: 30, protocol: 5, lp: 20 } },
  { mcapSol: 54030, fees: { creator: 28, protocol: 5, lp: 20 } },
  { mcapSol: 58940, fees: { creator: 25, protocol: 5, lp: 20 } },
  { mcapSol: 63860, fees: { creator: 23, protocol: 5, lp: 20 } },
  { mcapSol: 68770, fees: { creator: 20, protocol: 5, lp: 20 } },
  { mcapSol: 73681, fees: { creator: 18, protocol: 5, lp: 20 } },
  { mcapSol: 78590, fees: { creator: 15, protocol: 5, lp: 20 } },
  { mcapSol: 83500, fees: { creator: 13, protocol: 5, lp: 20 } },
  { mcapSol: 88400, fees: { creator: 10, protocol: 5, lp: 20 } },
  { mcapSol: 93330, fees: { creator: 8, protocol: 5, lp: 20 } },
  { mcapSol: 98240, fees: { creator: 5, protocol: 5, lp: 20 } }
];
function totalBps(f2) {
  return f2.protocol + f2.creator + f2.lp;
}
function ammFeesForMcapSol(mcapSol) {
  let chosen = AMM_FEE_TIERS[0].fees;
  for (const tier of AMM_FEE_TIERS) {
    if (mcapSol >= tier.mcapSol) chosen = tier.fees;
    else break;
  }
  return chosen;
}
function newCurve() {
  return {
    vSol: CURVE.initialVirtualSol,
    vTok: CURVE.initialVirtualTok,
    realTok: CURVE.initialRealTok,
    supply: CURVE.supply
  };
}
function curveMcapLamports(s) {
  if (s.vTok <= 0) return 0;
  return s.vSol * s.supply / s.vTok;
}
function curveMcapSol(s) {
  return curveMcapLamports(s) / LAMPORTS_PER_SOL;
}
function curvePriceSol(s) {
  if (s.vTok <= 0) return 0;
  return s.vSol / s.vTok * (RAW_PER_TOKEN / LAMPORTS_PER_SOL);
}
function curveProgress(s) {
  const p = 1 - s.realTok / CURVE.initialRealTok;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}
function feeCeil(amount, bps) {
  return Math.ceil(amount * bps / 1e4);
}
function curveBuyQuote(s, lamportsIn, fees = CURVE_FEES) {
  const zero = { tokensOut: 0, solToCurve: 0, feeLamports: 0, solSpent: 0, avgPriceSol: 0, after: { ...s } };
  if (!(lamportsIn > 1) || s.vTok <= 0 || s.realTok <= 0) return zero;
  const bps = totalBps(fees);
  const input = Math.floor((lamportsIn - 1) * 1e4 / (1e4 + bps));
  let tokens = Math.floor(input * s.vTok / (s.vSol + input));
  if (tokens > s.realTok) tokens = s.realTok;
  if (tokens <= 0) return zero;
  const cost = Math.floor(tokens * s.vSol / (s.vTok - tokens)) + 1;
  const fee = feeCeil(cost, fees.protocol) + feeCeil(cost, fees.creator);
  const spent = cost + fee;
  return {
    tokensOut: tokens,
    solToCurve: cost,
    feeLamports: fee,
    solSpent: spent,
    avgPriceSol: spent / LAMPORTS_PER_SOL / (tokens / RAW_PER_TOKEN),
    after: { vSol: s.vSol + cost, vTok: s.vTok - tokens, realTok: s.realTok - tokens, supply: s.supply }
  };
}
function curveSellQuote(s, tokensIn, fees = CURVE_FEES) {
  if (!(tokensIn > 0) || s.vTok <= 0) {
    return { solOut: 0, solFromCurve: 0, feeLamports: 0, avgPriceSol: 0, after: { ...s } };
  }
  const gross = Math.floor(tokensIn * s.vSol / (s.vTok + tokensIn));
  const fee = feeCeil(gross, fees.protocol) + feeCeil(gross, fees.creator);
  const out = Math.max(0, gross - fee);
  return {
    solOut: out,
    solFromCurve: gross,
    feeLamports: fee,
    avgPriceSol: out / LAMPORTS_PER_SOL / (tokensIn / RAW_PER_TOKEN),
    after: { vSol: s.vSol - gross, vTok: s.vTok + tokensIn, realTok: s.realTok + tokensIn, supply: s.supply }
  };
}
function poolMcapSol(p) {
  if (p.base <= 0) return 0;
  return p.quote * p.supply / p.base / LAMPORTS_PER_SOL;
}
function poolPriceSol(p) {
  if (p.base <= 0) return 0;
  return p.quote / p.base * (RAW_PER_TOKEN / LAMPORTS_PER_SOL);
}
function ammFees(p) {
  const f2 = ammFeesForMcapSol(poolMcapSol(p));
  return p.hasCreator === false ? { ...f2, creator: 0 } : f2;
}
function poolBuyQuote(p, lamportsIn) {
  const zeroAfter = { vSol: p.quote, vTok: p.base, realTok: p.base, supply: p.supply };
  const zero = { tokensOut: 0, solToCurve: 0, feeLamports: 0, solSpent: 0, avgPriceSol: 0, after: zeroAfter };
  if (!(lamportsIn > 1) || p.base <= 0 || p.quote <= 0) return zero;
  const f2 = ammFees(p);
  let effective = Math.floor(lamportsIn * 1e4 / (1e4 + totalBps(f2)));
  const lpFee = feeCeil(effective, f2.lp);
  const protocolFee = feeCeil(effective, f2.protocol);
  const creatorFee = feeCeil(effective, f2.creator);
  const total = effective + lpFee + protocolFee + creatorFee;
  if (total > lamportsIn) effective -= total - lamportsIn;
  const input = effective - 1;
  if (input <= 0) return zero;
  const out = Math.floor(p.base * input / (p.quote + input));
  if (out <= 0 || out >= p.base) return zero;
  const quoteIn = Math.ceil(p.quote * out / (p.base - out));
  const fLp = feeCeil(quoteIn, f2.lp);
  const fee = fLp + feeCeil(quoteIn, f2.protocol) + feeCeil(quoteIn, f2.creator);
  const spent = quoteIn + fee;
  return {
    tokensOut: out,
    solToCurve: quoteIn + fLp,
    feeLamports: fee,
    solSpent: spent,
    avgPriceSol: spent / LAMPORTS_PER_SOL / (out / RAW_PER_TOKEN),
    after: { vSol: p.quote + quoteIn + fLp, vTok: p.base - out, realTok: p.base - out, supply: p.supply }
  };
}
function poolSellQuote(p, tokensIn) {
  const same = { vSol: p.quote, vTok: p.base, realTok: p.base, supply: p.supply };
  if (!(tokensIn > 0) || p.base <= 0 || p.quote <= 0) {
    return { solOut: 0, solFromCurve: 0, feeLamports: 0, avgPriceSol: 0, after: same };
  }
  const f2 = ammFees(p);
  const gross = Math.floor(p.quote * tokensIn / (p.base + tokensIn));
  const lpFee = feeCeil(gross, f2.lp);
  const fee = lpFee + feeCeil(gross, f2.protocol) + feeCeil(gross, f2.creator);
  const out = Math.max(0, gross - fee);
  return {
    solOut: out,
    solFromCurve: gross - lpFee,
    feeLamports: fee,
    avgPriceSol: out / LAMPORTS_PER_SOL / (tokensIn / RAW_PER_TOKEN),
    after: { vSol: p.quote - (gross - lpFee), vTok: p.base + tokensIn, realTok: p.base + tokensIn, supply: p.supply }
  };
}

// src/core/codec.ts
var B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
var B58_MAP = (() => {
  const m = new Int16Array(128).fill(-1);
  for (let i = 0; i < B58_ALPHABET.length; i++) m[B58_ALPHABET.charCodeAt(i)] = i;
  return m;
})();
function base58Encode(bytes) {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const size = Math.ceil((bytes.length - zeros) * 138 / 100) + 1;
  const buf = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 256 * buf[k];
      buf[k] = carry % 58;
      carry = carry / 58 | 0;
    }
    length = j;
  }
  let it = size - length;
  while (it < size && buf[it] === 0) it++;
  let out = "1".repeat(zeros);
  for (; it < size; it++) out += B58_ALPHABET[buf[it]];
  return out;
}
function base58Decode(str) {
  if (str.length === 0) return new Uint8Array(0);
  let zeros = 0;
  while (zeros < str.length && str[zeros] === "1") zeros++;
  const size = Math.ceil((str.length - zeros) * 733 / 1e3) + 1;
  const buf = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < str.length; i++) {
    const c = str.charCodeAt(i);
    const v = c < 128 ? B58_MAP[c] : -1;
    if (v < 0) throw new Error(`invalid base58 character at ${i}`);
    let carry = v;
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 58 * buf[k];
      buf[k] = carry & 255;
      carry >>= 8;
    }
    length = j;
  }
  let it = size - length;
  while (it < size && buf[it] === 0) it++;
  const out = new Uint8Array(zeros + (size - it));
  out.set(buf.subarray(it), zeros);
  return out;
}
function isAddress(s) {
  if (typeof s !== "string" || s.length < 32 || s.length > 44) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 128 || B58_MAP[c] < 0) return false;
  }
  try {
    return base58Decode(s).length === 32;
  } catch {
    return false;
  }
}
function base64Decode(b64) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function base64Encode(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
var utf8 = new TextDecoder("utf-8", { fatal: false });
var OutOfData = class extends Error {
  constructor() {
    super("out of data");
  }
};
var Reader = class {
  constructor(bytes, start = 0) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = start;
  }
  view;
  pos;
  get remaining() {
    return this.bytes.length - this.pos;
  }
  need(n2) {
    if (this.pos + n2 > this.bytes.length) throw new OutOfData();
  }
  u8() {
    this.need(1);
    return this.view.getUint8(this.pos++);
  }
  bool() {
    return this.u8() !== 0;
  }
  u16() {
    this.need(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u32() {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  /** u64 as a JS number (exact below 2^53). */
  u64() {
    this.need(8);
    const lo = this.view.getUint32(this.pos, true);
    const hi = this.view.getUint32(this.pos + 4, true);
    this.pos += 8;
    return hi * 4294967296 + lo;
  }
  i64() {
    this.need(8);
    const lo = this.view.getUint32(this.pos, true);
    const hi = this.view.getInt32(this.pos + 4, true);
    this.pos += 8;
    return hi * 4294967296 + lo;
  }
  /** 128-bit little endian as an approximate JS number. */
  i128() {
    this.need(16);
    let v = 0;
    for (let i = 15; i >= 0; i--) v = v * 256 + this.bytes[this.pos + i];
    const neg = (this.bytes[this.pos + 15] & 128) !== 0;
    this.pos += 16;
    return neg ? v - 2 ** 128 : v;
  }
  u128() {
    this.need(16);
    let v = 0;
    for (let i = 15; i >= 0; i--) v = v * 256 + this.bytes[this.pos + i];
    this.pos += 16;
    return v;
  }
  pubkey() {
    this.need(32);
    const s = base58Encode(this.bytes.subarray(this.pos, this.pos + 32));
    this.pos += 32;
    return s;
  }
  string(maxLen = 4096) {
    const len = this.u32();
    if (len > maxLen) throw new OutOfData();
    this.need(len);
    const s = utf8.decode(this.bytes.subarray(this.pos, this.pos + len));
    this.pos += len;
    return s;
  }
  skip(n2) {
    this.need(n2);
    this.pos += n2;
  }
};
function bytesEqualPrefix(a, prefix) {
  if (a.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (a[i] !== prefix[i]) return false;
  return true;
}

// src/core/types.ts
var WSOL_MINT = "So11111111111111111111111111111111111111112";
var DEFAULT_PUBKEY = "11111111111111111111111111111111";
var PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
var PUMP_AMM_PROGRAM = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";

// src/core/decode.ts
var DISC = {
  create: [27, 114, 169, 77, 222, 235, 99, 118],
  trade: [189, 219, 127, 211, 78, 230, 97, 238],
  complete: [95, 114, 97, 156, 212, 46, 152, 8],
  migration: [189, 233, 93, 185, 92, 148, 234, 148],
  ammBuy: [103, 244, 82, 31, 44, 245, 119, 119],
  ammSell: [62, 47, 55, 10, 165, 3, 220, 42],
  ammCreatePool: [177, 49, 12, 210, 160, 118, 167, 116]
};
var isSolQuote = (q) => q === void 0 || q === DEFAULT_PUBKEY || q === WSOL_MINT;
function tryOptional(fn, fallback) {
  try {
    return fn();
  } catch (e) {
    if (e instanceof OutOfData) return fallback;
    throw e;
  }
}
function decodeCreate(data, ctx) {
  try {
    const r = new Reader(data, 8);
    const name = r.string(256);
    const symbol = r.string(64);
    const uri = r.string(512);
    const mint = r.pubkey();
    r.pubkey();
    const user = r.pubkey();
    const creator = r.pubkey();
    const chainTs = r.i64();
    const vTok = r.u64();
    const vSol = r.u64();
    const realTok = r.u64();
    const supply = r.u64();
    const ev = {
      k: "create",
      ts: ctx.ts,
      slot: ctx.slot,
      sig: ctx.sig,
      src: ctx.src,
      chainTs,
      mint,
      name,
      symbol,
      uri,
      creator,
      user,
      vSol,
      vTok,
      realTok,
      supply
    };
    tryOptional(() => {
      r.pubkey();
      ev.mayhem = r.bool();
      r.bool();
      const quoteMint = r.pubkey();
      const vQuote = r.u64();
      if (!isSolQuote(quoteMint)) {
        ev.nonSolQuote = true;
        if (vQuote > 0) ev.vSol = vQuote;
      }
      r.u64();
      ev.holderReward = r.bool();
      return null;
    }, null);
    if (!(ev.vTok > 0) || !(ev.supply > 0)) return null;
    return ev;
  } catch {
    return null;
  }
}
function decodeTrade(data, ctx) {
  try {
    const r = new Reader(data, 8);
    const mint = r.pubkey();
    const sol2 = r.u64();
    const tok = r.u64();
    const buy = r.bool();
    const user = r.pubkey();
    const chainTs = r.i64();
    const vSol = r.u64();
    const vTok = r.u64();
    const realSol = r.u64();
    const realTok = r.u64();
    const ev = {
      k: "trade",
      ts: ctx.ts,
      slot: ctx.slot,
      sig: ctx.sig,
      src: ctx.src,
      chainTs,
      mint,
      buy,
      sol: sol2,
      tok,
      user,
      venue: "curve",
      vSol,
      vTok,
      realSol,
      realTok
    };
    tryOptional(() => {
      r.pubkey();
      r.u64();
      const fee = r.u64();
      r.pubkey();
      r.u64();
      const creatorFee = r.u64();
      ev.fee = fee + creatorFee;
      r.bool();
      r.u64();
      r.u64();
      r.u64();
      r.i64();
      ev.ix = r.string(64);
      r.bool();
      r.u64();
      r.u64();
      r.u64();
      const buyback = r.u64();
      ev.fee += buyback;
      const holders = r.u32();
      if (holders > 64) throw new OutOfData();
      r.skip(holders * 34);
      const quoteMint = r.pubkey();
      if (!isSolQuote(quoteMint)) {
        const quoteAmount = r.u64();
        const vQuote = r.u64();
        const realQuote = r.u64();
        ev.sol = quoteAmount;
        ev.vSol = vQuote;
        ev.realSol = realQuote;
        ev.nonSolQuote = true;
      }
      return null;
    }, null);
    if (!(ev.vTok > 0) || !(ev.vSol > 0)) return null;
    return ev;
  } catch {
    return null;
  }
}
function decodeComplete(data, ctx) {
  try {
    const r = new Reader(data, 8);
    r.pubkey();
    const mint = r.pubkey();
    return { k: "complete", ts: ctx.ts, slot: ctx.slot, sig: ctx.sig, src: ctx.src, mint };
  } catch {
    return null;
  }
}
function decodeMigration(data, ctx) {
  try {
    const r = new Reader(data, 8);
    r.pubkey();
    const mint = r.pubkey();
    const mintAmount = r.u64();
    const solAmount = r.u64();
    r.u64();
    r.pubkey();
    r.i64();
    const pool = r.pubkey();
    return { k: "migrate", ts: ctx.ts, slot: ctx.slot, sig: ctx.sig, src: ctx.src, mint, pool, mintAmount, solAmount };
  } catch {
    return null;
  }
}
function decodeCreatePool(data, ctx) {
  try {
    const r = new Reader(data, 8);
    r.i64();
    r.u16();
    r.pubkey();
    const baseMint = r.pubkey();
    const quoteMint = r.pubkey();
    r.u8();
    r.u8();
    r.u64();
    r.u64();
    const poolBase = r.u64();
    const poolQuote = r.u64();
    r.u64();
    r.u64();
    r.u64();
    r.u8();
    const pool = r.pubkey();
    const ev = {
      k: "pool",
      ts: ctx.ts,
      slot: ctx.slot,
      sig: ctx.sig,
      src: ctx.src,
      pool,
      mint: baseMint,
      quoteIsSol: isSolQuote(quoteMint),
      base: poolBase,
      quote: poolQuote
    };
    tryOptional(() => {
      r.pubkey();
      r.pubkey();
      r.pubkey();
      ev.coinCreator = r.pubkey();
      return null;
    }, null);
    return ev;
  } catch {
    return null;
  }
}
function decodeAmmSwap(data, ctx, buy) {
  try {
    const r = new Reader(data, 8);
    const chainTs = r.i64();
    const base = r.u64();
    r.u64();
    r.u64();
    r.u64();
    const poolBase = r.u64();
    const poolQuote = r.u64();
    const quoteAmount = r.u64();
    r.u64();
    const lpFee = r.u64();
    r.u64();
    const protocolFee = r.u64();
    const vaultDelta = r.u64();
    r.u64();
    const pool = r.pubkey();
    const user = r.pubkey();
    r.pubkey();
    r.pubkey();
    r.pubkey();
    r.pubkey();
    r.pubkey();
    r.u64();
    const creatorFee = r.u64();
    const ev = {
      k: "ammSwap",
      ts: ctx.ts,
      chainTs,
      slot: ctx.slot,
      sig: ctx.sig,
      src: ctx.src,
      pool,
      buy,
      base,
      quoteDelta: vaultDelta > 0 ? vaultDelta : buy ? quoteAmount + lpFee : Math.max(0, quoteAmount - lpFee),
      fee: lpFee + protocolFee + creatorFee,
      user,
      poolBase,
      poolQuote,
      virtualQuote: 0
    };
    tryOptional(() => {
      if (buy) {
        r.bool();
        r.u64();
        r.u64();
        r.u64();
        r.i64();
        r.u64();
        r.string(64);
      }
      r.u64();
      r.u64();
      r.u64();
      r.u64();
      ev.virtualQuote = Math.max(0, r.i128());
      r.bool();
      const supply = r.u64();
      if (supply > 0) ev.supply = supply;
      return null;
    }, null);
    if (!(ev.poolBase > 0) || !(ev.poolQuote > 0)) return null;
    return ev;
  } catch {
    return null;
  }
}
var PREFIX = "Program data: ";
function decodeEventData(b64, ctx) {
  let data;
  try {
    data = base64Decode(b64.trim());
  } catch {
    return null;
  }
  if (data.length < 8) return null;
  if (bytesEqualPrefix(data, DISC.trade)) return decodeTrade(data, ctx);
  if (bytesEqualPrefix(data, DISC.create)) return decodeCreate(data, ctx);
  if (bytesEqualPrefix(data, DISC.ammBuy)) return decodeAmmSwap(data, ctx, true);
  if (bytesEqualPrefix(data, DISC.ammSell)) return decodeAmmSwap(data, ctx, false);
  if (bytesEqualPrefix(data, DISC.complete)) return decodeComplete(data, ctx);
  if (bytesEqualPrefix(data, DISC.migration)) return decodeMigration(data, ctx);
  if (bytesEqualPrefix(data, DISC.ammCreatePool)) return decodeCreatePool(data, ctx);
  return null;
}
function decodeLogs(logs, ctx) {
  const out = [];
  for (const line of logs) {
    if (typeof line !== "string" || !line.startsWith(PREFIX)) continue;
    const ev = decodeEventData(line.slice(PREFIX.length), ctx);
    if (ev) out.push(ev);
  }
  return out;
}
function ammPostReserves(s, reservesArePreTrade = true) {
  const vq = s.virtualQuote || 0;
  if (!reservesArePreTrade) return { base: s.poolBase, quote: s.poolQuote + vq };
  if (s.buy) return { base: s.poolBase - s.base, quote: s.poolQuote + s.quoteDelta + vq };
  return { base: s.poolBase + s.base, quote: Math.max(0, s.poolQuote - s.quoteDelta) + vq };
}

// src/core/util.ts
var clamp = (x, lo, hi) => x < lo ? lo : x > hi ? hi : x;
var num = (x, fallback = 0) => {
  const n2 = typeof x === "string" ? Number(x) : x;
  return typeof n2 === "number" && Number.isFinite(n2) ? n2 : fallback;
};
var logit = (p) => {
  const q = clamp(p, 1e-6, 1 - 1e-6);
  return Math.log(q / (1 - q));
};
var sigmoid = (z) => z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
var idCounter = 0;
function newId(prefix = "") {
  idCounter = (idCounter + 1) % 1e6;
  return prefix + Date.now().toString(36) + idCounter.toString(36) + Math.random().toString(36).slice(2, 6);
}
function runSteps(it) {
  for (; ; ) {
    const r = it.next();
    if (r.done) return r.value;
  }
}
async function runStepsAsync(it, sliceMs = 15) {
  let t = Date.now();
  for (; ; ) {
    const r = it.next();
    if (r.done) return r.value;
    if (Date.now() - t > sliceMs) {
      await new Promise((res) => setTimeout(res, 0));
      t = Date.now();
    }
  }
}
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = s + 1831565813 >>> 0;
    let t = s;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var LRU = class {
  constructor(max) {
    this.max = max;
  }
  map = /* @__PURE__ */ new Map();
  get size() {
    return this.map.size;
  }
  get(k) {
    const v = this.map.get(k);
    if (v !== void 0) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  peek(k) {
    return this.map.get(k);
  }
  has(k) {
    return this.map.has(k);
  }
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }
  delete(k) {
    return this.map.delete(k);
  }
  /** Drops least-recently-used entries until `target` remain, sparing those `keep` accepts while possible. */
  shrinkTo(target, keep) {
    let dropped = 0;
    if (keep) {
      for (const [k, v] of this.map) {
        if (this.map.size <= target) break;
        if (!keep(k, v)) {
          this.map.delete(k);
          dropped++;
        }
      }
    }
    while (this.map.size > target) {
      this.map.delete(this.map.keys().next().value);
      dropped++;
    }
    return dropped;
  }
  entries() {
    return this.map.entries();
  }
  values() {
    return this.map.values();
  }
  clear() {
    this.map.clear();
  }
};
var Ring = class {
  constructor(cap) {
    this.cap = cap;
    this.buf = new Array(cap);
  }
  buf;
  start = 0;
  len = 0;
  get length() {
    return this.len;
  }
  push(v) {
    if (this.len < this.cap) {
      this.buf[(this.start + this.len) % this.cap] = v;
      this.len++;
    } else {
      this.buf[this.start] = v;
      this.start = (this.start + 1) % this.cap;
    }
  }
  at(i) {
    if (i < 0) i += this.len;
    if (i < 0 || i >= this.len) return void 0;
    return this.buf[(this.start + i) % this.cap];
  }
  last() {
    return this.at(this.len - 1);
  }
  toArray() {
    const out = [];
    for (let i = 0; i < this.len; i++) out.push(this.buf[(this.start + i) % this.cap]);
    return out;
  }
  clear() {
    this.start = 0;
    this.len = 0;
  }
};
var DecayRate = class {
  constructor(halfLifeMs = 6e4) {
    this.halfLifeMs = halfLifeMs;
  }
  value = 0;
  last = 0;
  add(ts, amount = 1) {
    this.decay(ts);
    this.value += amount;
  }
  decay(ts) {
    if (this.last === 0) {
      this.last = ts;
      return;
    }
    const dt = ts - this.last;
    if (dt > 0) {
      this.value *= Math.pow(0.5, dt / this.halfLifeMs);
      this.last = ts;
    }
  }
  /** Approximate events per minute at `ts`. */
  perMinute(ts) {
    this.decay(ts);
    return this.value * Math.LN2 * 6e4 / this.halfLifeMs;
  }
};
function quantile(sorted, q) {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * clamp(q, 0, 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function mean(xs) {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}
function wilson(successes, n2, z = 1.96) {
  if (n2 === 0) return { lo: 0, hi: 1, p: NaN };
  const p = successes / n2;
  const denom = 1 + z * z / n2;
  const centre = (p + z * z / (2 * n2)) / denom;
  const half = z * Math.sqrt(p * (1 - p) / n2 + z * z / (4 * n2 * n2)) / denom;
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half), p };
}
function meanCI(xs) {
  const n2 = xs.length;
  if (n2 === 0) return { mean: NaN, lo: NaN, hi: NaN, n: n2 };
  const m = mean(xs);
  if (n2 === 1) return { mean: m, lo: -Infinity, hi: Infinity, n: n2 };
  let v = 0;
  for (const x of xs) v += (x - m) ** 2;
  const se = Math.sqrt(v / (n2 - 1) / n2);
  return { mean: m, lo: m - 1.96 * se, hi: m + 1.96 * se, n: n2 };
}
var hourOf = (ts) => Math.floor(ts / 36e5);
function clusteredMeanCI(xs, cluster, level = 0.95) {
  const n2 = xs.length;
  if (n2 === 0) return { mean: NaN, lo: NaN, hi: NaN, n: n2, clusters: 0 };
  let sum = 0;
  for (let i = 0; i < n2; i++) sum += xs[i];
  const m = sum / n2;
  const by = /* @__PURE__ */ new Map();
  let sq = 0;
  for (let i = 0; i < n2; i++) {
    const d = xs[i] - m;
    sq += d * d;
    by.set(cluster[i], (by.get(cluster[i]) ?? 0) + d);
  }
  const c = by.size;
  if (n2 < 2 || c < 2) return { mean: m, lo: -Infinity, hi: Infinity, n: n2, clusters: c };
  const q = 1 - (1 - level) / 2;
  let cs = 0;
  for (const v of by.values()) cs += v * v;
  const half = Math.max(tInv(q, n2 - 1) * Math.sqrt(sq / (n2 - 1) / n2), tInv(q, c - 1) * Math.sqrt(cs / (n2 * n2) * (c / (c - 1))));
  return { mean: m, lo: m - half, hi: m + half, n: n2, clusters: c };
}
function normInv(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
  if (q < 0.02425) {
    const t2 = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * t2 + c[1]) * t2 + c[2]) * t2 + c[3]) * t2 + c[4]) * t2 + c[5]) / ((((d[0] * t2 + d[1]) * t2 + d[2]) * t2 + d[3]) * t2 + 1);
  }
  if (q > 1 - 0.02425) return -normInv(1 - q);
  const t = q - 0.5;
  const r = t * t;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * t / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
function tInv(p, df) {
  if (!(df >= 1)) return Infinity;
  if (df === 1) return Math.tan(Math.PI * (p - 0.5));
  if (df === 2) {
    const a = 2 * p - 1;
    return a * Math.sqrt(2 / (1 - a * a));
  }
  const z = normInv(p);
  const z2 = z * z;
  const g1 = z * (z2 + 1) / 4;
  const g2 = z * ((5 * z2 + 16) * z2 + 3) / 96;
  const g3 = z * (((3 * z2 + 19) * z2 + 17) * z2 - 15) / 384;
  const g4 = z * ((((79 * z2 + 776) * z2 + 1482) * z2 - 1920) * z2 - 945) / 92160;
  return z + g1 / df + g2 / df ** 2 + g3 / df ** 3 + g4 / df ** 4;
}
var silentLogger = { debug() {
}, info() {
}, warn() {
}, error() {
} };

// src/core/features.ts
var MarketPulse = class {
  buys = new DecayRate(5 * 6e4);
  sells = new DecayRate(5 * 6e4);
  launches = new DecayRate(10 * 6e4);
  history = [];
  lastSample = 0;
  onTrade(ts, buy, sol2) {
    if (buy) this.buys.add(ts, sol2);
    else this.sells.add(ts, sol2);
  }
  onLaunch(ts) {
    this.launches.add(ts);
  }
  /** SOL per minute of net buying across all tracked tokens. */
  netPerMin(ts) {
    return this.buys.perMinute(ts) - this.sells.perMinute(ts);
  }
  launchesPerMin(ts) {
    return this.launches.perMinute(ts);
  }
  buyPerMin(ts) {
    return this.buys.perMinute(ts);
  }
  /** z-score of current buy volume vs the last ~24h of samples. */
  heat(ts) {
    const v = this.buys.perMinute(ts);
    if (ts - this.lastSample > 6e4) {
      this.history.push(v);
      if (this.history.length > 1440) this.history.shift();
      this.lastSample = ts;
    }
    if (this.history.length < 10) return 0;
    let m = 0;
    for (const x of this.history) m += x;
    m /= this.history.length;
    let s = 0;
    for (const x of this.history) s += (x - m) ** 2;
    const sd = Math.sqrt(s / (this.history.length - 1));
    return sd > 0 ? clamp((v - m) / sd, -3, 3) : 0;
  }
};
function extractFeatures(t, ctx) {
  const now = ctx.now;
  const w60 = t.window(now, 6e4);
  const w300 = t.window(now, 3e5);
  const prev60 = t.window(now, 6e4, 6e4);
  const scan = t.scanHolders(now, 6e4, (a) => ctx.wallets.isSmart(a));
  const conc = scan;
  let whaleMax = 0;
  for (let i = t.trades.length - 1; i >= 0; i--) {
    const r = t.trades.at(i);
    if (now - r.ts > 3e5) break;
    if (r.buy && r.sol > whaleMax) whaleMax = r.sol;
  }
  const smart = scan.smart;
  const observed = now - ctx.wallets.startedAt > 45 * 6e4;
  const freshShare = observed && t.uniqueBuyers > 0 ? t.freshBuys / t.uniqueBuyers : NaN;
  const narrative = ctx.narratives.describe(t.mint, ctx.mcapOf);
  const creator = t.creator ? ctx.wallets.creator(t.creator, now) : { launches24h: 0, best: 0, graduated: 0, launches: 0 };
  const m = t.meta;
  const socials = (m.twitter ? 1 : 0) + (m.telegram ? 1 : 0) + (m.website ? 1 : 0);
  const mcap = t.mcapSol > 0 ? t.mcapSol : 1e-9;
  const ago30 = t.mcapAgo(now, 3e4);
  const ago120 = t.mcapAgo(now, 12e4);
  const hour2 = new Date(now).getUTCHours() + new Date(now).getUTCMinutes() / 60;
  return {
    stage: t.stage === "amm" ? "amm" : "curve",
    ageSec: Math.max(0, (now - t.createdAt) / 1e3),
    mcapSol: t.mcapSol,
    progress: t.progress,
    net60: w60.net,
    net300: w300.net,
    netPrev60: prev60.net,
    buys60: w60.buyN,
    sells60: w60.sellN,
    uniq60: scan.uniqRecent,
    uniqTotal: t.uniqueBuyers,
    trades60: w60.n,
    avgBuy300: w300.buyN > 0 ? w300.buySol / w300.buyN : 0,
    whale300: w300.buySol > 0 ? clamp(whaleMax / w300.buySol, 0, 1) : 0,
    devShare: t.devBal / t.supply,
    devSold: t.devMaxBal > 0 ? clamp(t.devSoldTok / t.devMaxBal, 0, 1) : t.devSoldTok > 0 ? 1 : 0,
    bundleShare: t.bundleTok / t.supply,
    earlyShare: t.earlyTok / t.supply,
    top10: conc.top10,
    top1: conc.top1,
    holders: conc.holders,
    drawdown: t.athMcapSol > 0 ? clamp(1 - t.mcapSol / t.athMcapSol, 0, 1) : 0,
    chg30: ago30 > 0 ? Math.log(mcap / ago30) : 0,
    chg120: ago120 > 0 ? Math.log(mcap / ago120) : 0,
    smartBuyers: smart,
    freshShare,
    socials,
    tweetLink: narrative.tweetLinked ? 1 : 0,
    clusterSize: narrative.clusterSize,
    isLeader: narrative.clusterSize > 1 && narrative.isLeader ? 1 : 0,
    isFirst: narrative.clusterSize > 1 && narrative.isFirst ? 1 : 0,
    creatorLaunches24h: creator.launches24h,
    creatorBest: creator.best,
    heat: ctx.pulse.heat(now),
    hourUtc: hour2,
    sinceMigrateSec: t.migrateAt ? Math.max(0, (now - t.migrateAt) / 1e3) : 0,
    liquiditySol: t.stage === "amm" ? t.poolQuote / 1e9 : t.realSol / 1e9,
    dexSignal: (m.dexProfile ? 1 : 0) + ((m.boosts ?? 0) > 0 ? 1 : 0)
  };
}
var pct = (x) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
var s2 = (x) => Math.abs(x) >= 10 ? x.toFixed(0) : x.toFixed(2);
var FEATURE_DEFS = [
  { key: "age", label: "Age", x: (f2) => Math.log1p(f2.ageSec), show: (f2) => fmtAge(f2.ageSec), good: "young", bad: "old for its stage" },
  { key: "mcap", label: "Market cap", x: (f2) => Math.log(Math.max(f2.mcapSol, 1)), show: (f2) => `${f2.mcapSol.toFixed(0)} SOL`, good: "room to run", bad: "already big" },
  { key: "progress", label: "Curve progress", x: (f2) => f2.progress, show: (f2) => pct(f2.progress), good: "curve filling", bad: "curve nearly done" },
  { key: "net60", label: "Net inflow 60s", x: (f2) => Math.asinh(f2.net60), show: (f2) => `${s2(f2.net60)} SOL`, good: "buyers pouring in", bad: "net selling" },
  { key: "net300", label: "Net inflow 5m", x: (f2) => Math.asinh(f2.net300), show: (f2) => `${s2(f2.net300)} SOL`, good: "sustained demand", bad: "demand fading" },
  { key: "accel", label: "Acceleration", x: (f2) => clamp((f2.net60 - f2.netPrev60) / (Math.abs(f2.netPrev60) + 1), -3, 3), show: (f2) => `${s2(f2.net60 - f2.netPrev60)} SOL vs prior min`, good: "speeding up", bad: "slowing down" },
  { key: "buyRatio", label: "Buy share 60s", x: (f2) => (f2.buys60 + 1) / (f2.buys60 + f2.sells60 + 2), show: (f2) => `${f2.buys60}B/${f2.sells60}S`, good: "mostly buys", bad: "mostly sells" },
  { key: "uniq60", label: "New buyers 60s", x: (f2) => Math.log1p(f2.uniq60), show: (f2) => `${f2.uniq60}`, good: "many distinct buyers", bad: "few buyers" },
  { key: "uniqTotal", label: "Buyers total", x: (f2) => Math.log1p(f2.uniqTotal), show: (f2) => `${f2.uniqTotal}`, good: "broad participation", bad: "thin participation" },
  { key: "trades60", label: "Trades 60s", x: (f2) => Math.log1p(f2.trades60), show: (f2) => `${f2.trades60}`, good: "active", bad: "quiet" },
  { key: "avgBuy", label: "Avg buy 5m", x: (f2) => Math.log(0.01 + f2.avgBuy300), show: (f2) => `${s2(f2.avgBuy300)} SOL`, good: "retail-sized buys", bad: "whale-sized buys" },
  { key: "whale", label: "Largest buy share", x: (f2) => f2.whale300, show: (f2) => pct(f2.whale300), good: "no single whale", bad: "one whale dominates" },
  { key: "devShare", label: "Dev holds", x: (f2) => f2.devShare, show: (f2) => pct(f2.devShare), good: "dev holds little", bad: "dev holds a lot" },
  { key: "devSold", label: "Dev sold", x: (f2) => f2.devSold, show: (f2) => pct(f2.devSold), good: "dev holding", bad: "dev dumping" },
  { key: "bundle", label: "Bundled supply", x: (f2) => f2.bundleShare, show: (f2) => pct(f2.bundleShare), good: "no bundle", bad: "bundled at launch" },
  { key: "early", label: "Sniper supply", x: (f2) => f2.earlyShare, show: (f2) => pct(f2.earlyShare), good: "snipers gone", bad: "snipers holding" },
  { key: "top10", label: "Top 10 holders", x: (f2) => f2.top10, show: (f2) => pct(f2.top10), good: "spread out", bad: "concentrated" },
  { key: "holders", label: "Holders", x: (f2) => Math.log1p(f2.holders), show: (f2) => `${f2.holders}`, good: "many holders", bad: "few holders" },
  { key: "drawdown", label: "Below peak", x: (f2) => f2.drawdown, show: (f2) => pct(f2.drawdown), good: "near highs", bad: "far below peak" },
  { key: "chg30", label: "Move 30s", x: (f2) => clamp(f2.chg30, -2, 2), show: (f2) => pct(Math.exp(f2.chg30) - 1), good: "rising", bad: "falling" },
  { key: "chg120", label: "Move 2m", x: (f2) => clamp(f2.chg120, -2, 2), show: (f2) => pct(Math.exp(f2.chg120) - 1), good: "trending up", bad: "trending down" },
  { key: "smart", label: "Smart wallets in", x: (f2) => Math.log1p(f2.smartBuyers), show: (f2) => `${f2.smartBuyers}`, good: "proven wallets buying", bad: "" },
  { key: "fresh", label: "Fresh wallets", x: (f2) => Number.isFinite(f2.freshShare) ? f2.freshShare : 0.3, show: (f2) => Number.isFinite(f2.freshShare) ? pct(f2.freshShare) : "learning", good: "real wallets", bad: "brand-new wallets (alts)" },
  { key: "socials", label: "Socials", x: (f2) => f2.socials / 3, show: (f2) => `${f2.socials}/3`, good: "has socials", bad: "no socials" },
  { key: "tweet", label: "Tweet-linked", x: (f2) => f2.tweetLink, show: (f2) => f2.tweetLink ? "yes" : "no", good: "anchored to a tweet", bad: "" },
  { key: "cluster", label: "Narrative heat", x: (f2) => Math.log(Math.max(1, f2.clusterSize)), show: (f2) => `${f2.clusterSize} similar`, good: "hot narrative", bad: "" },
  { key: "leader", label: "Narrative leader", x: (f2) => f2.isLeader, show: (f2) => f2.isLeader ? "leads" : "\u2014", good: "leads its narrative", bad: "" },
  { key: "copycat", label: "Copycat", x: (f2) => f2.clusterSize > 1 && !f2.isLeader ? 1 : 0, show: (f2) => f2.clusterSize > 1 && !f2.isLeader ? "yes" : "no", good: "", bad: "copy of a bigger coin" },
  { key: "serial", label: "Serial launcher", x: (f2) => Math.log1p(Math.max(0, f2.creatorLaunches24h - 1)), show: (f2) => `${f2.creatorLaunches24h} launches/24h`, good: "", bad: "dev launches many coins" },
  { key: "creatorBest", label: "Dev track record", x: (f2) => Math.log1p(f2.creatorBest / 100), show: (f2) => `best ${f2.creatorBest.toFixed(0)} SOL`, good: "dev had a winner", bad: "" },
  { key: "heat", label: "Market heat", x: (f2) => f2.heat, show: (f2) => s2(f2.heat), good: "hot market", bad: "cold market" },
  { key: "hourSin", label: "Hour (sin)", x: (f2) => Math.sin(2 * Math.PI * f2.hourUtc / 24), show: (f2) => `${f2.hourUtc.toFixed(0)}h UTC`, good: "", bad: "" },
  { key: "hourCos", label: "Hour (cos)", x: (f2) => Math.cos(2 * Math.PI * f2.hourUtc / 24), show: (f2) => `${f2.hourUtc.toFixed(0)}h UTC`, good: "", bad: "" },
  { key: "liquidity", label: "Liquidity", x: (f2) => Math.log1p(f2.liquiditySol), show: (f2) => `${f2.liquiditySol.toFixed(1)} SOL`, good: "deep pool", bad: "thin pool" },
  { key: "sinceMig", label: "Since migration", x: (f2) => f2.stage === "amm" ? Math.log1p(f2.sinceMigrateSec) : 0, show: (f2) => f2.stage === "amm" ? fmtAge(f2.sinceMigrateSec) : "\u2014", good: "just graduated", bad: "stale after graduation" },
  { key: "dex", label: "DEX listing paid", x: (f2) => f2.dexSignal, show: (f2) => `${f2.dexSignal}/2`, good: "paid profile/boost", bad: "" }
];
var FEATURE_KEYS = FEATURE_DEFS.map((d) => d.key);
function featureVector(f2) {
  const out = new Array(FEATURE_DEFS.length);
  for (let i = 0; i < FEATURE_DEFS.length; i++) {
    const v = FEATURE_DEFS[i].x(f2);
    out[i] = Number.isFinite(v) ? v : 0;
  }
  return out;
}
function fmtAge(sec) {
  if (sec < 90) return `${Math.round(sec)}s`;
  if (sec < 5400) return `${Math.round(sec / 60)}m`;
  if (sec < 172800) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

// src/core/funnel.ts
var REASON_TEXT = {
  bot_off: "Auto-trading is paused",
  kill_switch: "Kill switch is on",
  autopilot_hold: "Autopilot: no rule is proven enough for real money yet \u2014 new live entries wait (open positions are still managed)",
  stage_off: "This stage is turned off in settings",
  non_sol_quote: "Coin is not paired with SOL",
  already_traded: "Already traded this coin (re-entry off)",
  max_open: "Max open positions reached",
  pending: "An order for this coin is already in flight",
  daily_loss_limit: "Daily loss limit reached",
  rate_limit: "Max trades per hour reached",
  feed_down: "Live data feed is down \u2014 not trading blind",
  warming_up: "Learning this market's score scale (first minutes after install)",
  insufficient_balance: "Not enough SOL \u2014 paper: Trades tab \u2192 Add paper SOL; live: fund the wallet",
  slippage: "Price moved more than your slippage before the buy landed",
  migrating: "Coin is migrating to PumpSwap (not tradable for a moment)",
  rule_conditions: "Does not meet the conditions of the rule in use",
  not_followed: "Its price is not followed right now (more graduated coins than the bot can follow at once) \u2014 not buying at an old price",
  no_price: "No tradable price yet",
  no_liquidity: "Not enough liquidity",
  size_too_small: "Position size too small after fees",
  live_error: "Live order error",
  live_disabled: "Live trading is not enabled on the server",
  "filter:mcap_min": "Market cap below your minimum",
  "filter:mcap_max": "Market cap above your maximum",
  "filter:dev": "Dev holds more than your limit",
  "filter:top10": "Top 10 holders above your limit",
  "filter:bundle": "Launch bundle above your limit",
  "filter:buyers": "Fewer buyers than your minimum",
  "filter:age_min": "Coin younger than your minimum age",
  "filter:age_max": "Coin older than your maximum age",
  "filter:socials": "No socials (you require them)",
  "filter:serial_dev": "Dev launched too many coins today",
  "filter:dev_sold": "Dev already sold more than your limit"
};
var HOUR = 36e5;
var Funnel = class _Funnel {
  recent = new Ring(500);
  byId = /* @__PURE__ */ new Map();
  hours = [];
  hour(now) {
    const t = Math.floor(now / HOUR) * HOUR;
    let h = this.hours[this.hours.length - 1];
    if (!h || h.t !== t) {
      if (h) this.finalize(h);
      h = { t, passes: 0, signals: 0, entered: 0, failed: 0, blocked: /* @__PURE__ */ new Map(), tokMax: /* @__PURE__ */ new Map(), hist100: null, coins: 0, maxScore: 0 };
      this.hours.push(h);
      if (this.hours.length > 48) this.hours.shift();
    }
    return h;
  }
  finalize(h) {
    if (!h.tokMax) return;
    h.hist100 = _Funnel.toHist(h.tokMax);
    h.coins = h.tokMax.size;
    h.tokMax = null;
  }
  static toHist(m) {
    const hist = new Array(101).fill(0);
    for (const v of m.values()) hist[Math.max(0, Math.min(100, Math.floor(v)))]++;
    return hist;
  }
  /** Every scoring pass: tracks each coin's best score of the hour. */
  noteScored(now, mint, score) {
    const h = this.hour(now);
    h.passes++;
    if (score > h.maxScore) h.maxScore = score;
    const m = h.tokMax;
    const prev = m.get(mint);
    if (prev === void 0 || score > prev) m.set(mint, score);
  }
  add(rec) {
    this.recent.push(rec);
    this.byId.set(rec.id, rec);
    if (this.byId.size > 1500) {
      const keep = new Set(this.recent.toArray().map((r) => r.id));
      for (const id of this.byId.keys()) if (!keep.has(id)) this.byId.delete(id);
    }
    const h = this.hour(rec.ts);
    h.signals++;
    if (rec.score > h.maxScore) h.maxScore = rec.score;
    this.count(h, rec.decision, rec.reason);
  }
  count(h, decision, reason) {
    if (decision === "entered") h.entered++;
    else if (decision === "failed") h.failed++;
    else if (decision === "blocked" && reason) h.blocked.set(reason, (h.blocked.get(reason) ?? 0) + 1);
  }
  update(id, decision, reason, positionId) {
    const rec = this.byId.get(id);
    if (!rec) return;
    rec.decision = decision;
    rec.reason = reason;
    if (positionId) rec.positionId = positionId;
    this.count(this.hour(rec.ts), decision, reason);
  }
  get(id) {
    return this.byId.get(id);
  }
  /**
   * Summary over the trailing window. `hist` has 10 bins of per-coin best scores;
   * `coinsAbove[t]` = coins whose best score reached ≥ t (t = 0…100) in the window.
   */
  summary(now, windowHours = 1) {
    this.hour(now);
    const from = now - windowHours * HOUR;
    let scored = 0;
    let signals = 0;
    let entered = 0;
    let failed = 0;
    let maxScore = 0;
    let hours = 0;
    const hist100 = new Array(101).fill(0);
    const blocked = /* @__PURE__ */ new Map();
    for (const h of this.hours) {
      if (h.t + HOUR <= from) continue;
      hours++;
      const hh = h.tokMax ? _Funnel.toHist(h.tokMax) : h.hist100 ?? [];
      hh.forEach((v, i) => hist100[i] += v);
      scored += h.tokMax ? h.tokMax.size : h.coins;
      signals += h.signals;
      entered += h.entered;
      failed += h.failed;
      if (h.maxScore > maxScore) maxScore = h.maxScore;
      for (const [k, v] of h.blocked) blocked.set(k, (blocked.get(k) ?? 0) + v);
    }
    const hist = new Array(10).fill(0);
    hist100.forEach((v, i) => hist[Math.min(9, Math.floor(i / 10))] += v);
    const coinsAbove = new Array(101).fill(0);
    let acc = 0;
    for (let i = 100; i >= 0; i--) {
      acc += hist100[i];
      coinsAbove[i] = acc;
    }
    const reasons = [...blocked.entries()].sort((a, b) => b[1] - a[1]).map(([reason, n2]) => ({ reason, n: n2, text: REASON_TEXT[reason] ?? reason }));
    return { windowHours, hours: Math.max(1, hours), scored, signals, entered, failed, maxScore, hist, coinsAbove, reasons };
  }
};

// src/core/boost.ts
var BOOST_DEFAULTS = {
  rounds: 300,
  lr: 0.08,
  depth: 3,
  lambda: 5,
  minHess: 8,
  minHessShare: 2e-3,
  minGain: 0,
  subsample: 0.8,
  colsample: 0.8,
  bins: 32,
  patience: 25,
  seed: 17
};
var sig = (z) => z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
function logLossOf(m, y, w, n2 = m.length) {
  let ll = 0;
  let sw = 0;
  for (let i = 0; i < n2; i++) {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, sig(m[i])));
    ll -= w[i] * (y[i] ? Math.log(p) : Math.log(1 - p));
    sw += w[i];
  }
  return sw > 0 ? ll / sw : NaN;
}
function* makeCuts(X, n2, d, bins, rand) {
  const take = Math.min(n2, 2e4);
  const pick2 = new Int32Array(take);
  for (let k = 0; k < take; k++) pick2[k] = n2 <= take ? k : Math.floor(rand() * n2);
  const cuts = [];
  const vals = new Float64Array(take);
  for (let j = 0; j < d; j++) {
    for (let k = 0; k < take; k++) vals[k] = X[pick2[k] * d + j];
    vals.sort();
    const out = [];
    for (let b = 1; b < bins; b++) {
      const v = vals[Math.min(take - 1, Math.floor(b / bins * take))];
      if (v < vals[take - 1] && (out.length === 0 || v > out[out.length - 1])) out.push(v);
    }
    cuts.push(Float64Array.from(out));
    yield;
  }
  return cuts;
}
function binOf(cuts, x) {
  let lo = 0;
  let hi = cuts.length;
  while (lo < hi) {
    const mid = lo + hi >> 1;
    if (cuts[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function treeOut(t, x, map) {
  let i = 0;
  while (t.f[i] >= 0) i = Math.fround(x[map[t.f[i]]]) <= t.t[i] ? t.l[i] : t.r[i];
  return t.v[i];
}
var identity = /* @__PURE__ */ new Map();
function identityMap(d) {
  let m = identity.get(d);
  if (!m) {
    m = Int32Array.from({ length: d }, (_, i) => i);
    identity.set(d, m);
  }
  return m;
}
function ensembleMargin(ens, x, map = identityMap(ens.keys.length)) {
  let s = 0;
  for (const t of ens.trees) s += treeOut(t, x, map);
  return s;
}
function ensembleContrib(ens, x, out, map = identityMap(ens.keys.length)) {
  let bias = 0;
  for (const t of ens.trees) {
    let i = 0;
    bias += t.v[0];
    while (t.f[i] >= 0) {
      const at2 = map[t.f[i]];
      const next = Math.fround(x[at2]) <= t.t[i] ? t.l[i] : t.r[i];
      out[at2] += t.v[next] - t.v[i];
      i = next;
    }
  }
  return bias;
}
function* boostSteps(train, valid, keys, params = {}) {
  const p = { ...BOOST_DEFAULTS, ...params };
  const { n: n2, d, X, y, w } = train;
  const rand = rng(p.seed);
  const B = Math.max(2, Math.min(255, p.bins));
  const cuts = yield* makeCuts(X, n2, d, B, rand);
  const nb = cuts.map((c) => c.length + 1);
  const skip = new Set(p.skip ?? []);
  const bins = new Uint8Array(n2 * d);
  for (let i = 0; i < n2; i++) {
    for (let j = 0; j < d; j++) bins[i * d + j] = binOf(cuts[j], X[i * d + j]);
    if ((i & 4095) === 4095) yield;
  }
  yield;
  const m = Float64Array.from(train.base);
  const g = new Float64Array(n2);
  const h = new Float64Array(n2);
  const vm = valid ? Float64Array.from(valid.base) : null;
  const curve = [valid ? logLossOf(vm, valid.y, valid.w) : logLossOf(m, y, w)];
  let best = curve[0];
  let bestRounds = 0;
  const trees = [];
  const gains = [];
  const hist = (rows, feats) => {
    const hs = new Float64Array(d * B * 2);
    for (let r = 0; r < rows.length; r++) {
      const i = rows[r];
      const gi = g[i];
      const hi = h[i];
      const o = i * d;
      for (let k = 0; k < feats.length; k++) {
        const j = feats[k];
        const at2 = (j * B + bins[o + j]) * 2;
        hs[at2] += gi;
        hs[at2 + 1] += hi;
      }
    }
    return hs;
  };
  for (let round = 0; round < p.rounds; round++) {
    let Htot = 0;
    for (let i = 0; i < n2; i++) {
      const q = sig(m[i]);
      g[i] = w[i] * (q - y[i]);
      h[i] = w[i] * Math.max(q * (1 - q), 1e-6);
      Htot += h[i];
    }
    const minH = Math.max(p.minHess, p.minHessShare * Htot);
    const rowList = [];
    for (let i = 0; i < n2; i++) if (p.subsample >= 1 || rand() < p.subsample) rowList.push(i);
    const featList = [];
    for (let j = 0; j < d; j++) if (nb[j] > 1 && !skip.has(j) && (p.colsample >= 1 || rand() < p.colsample)) featList.push(j);
    if (featList.length === 0 || rowList.length < 2) break;
    const feats = Int32Array.from(featList);
    const tree = { f: [], t: [], l: [], r: [], v: [] };
    const splitBin = [];
    const gain = new Array(keys.length).fill(0);
    const leafOf = (G, H2) => -G / (H2 + p.lambda) * p.lr;
    const newNode = (G, H2) => {
      tree.f.push(-1);
      tree.t.push(0);
      tree.l.push(-1);
      tree.r.push(-1);
      tree.v.push(leafOf(G, H2));
      splitBin.push(-1);
      return tree.f.length - 1;
    };
    const rootRows = Int32Array.from(rowList);
    let G0 = 0;
    let H0 = 0;
    for (const i of rootRows) {
      G0 += g[i];
      H0 += h[i];
    }
    const open = [{ id: newNode(G0, H0), rows: rootRows, hs: hist(rootRows, feats), G: G0, H: H0, depth: 0 }];
    while (open.length) {
      const node = open.pop();
      if (node.depth >= p.depth || node.H < 2 * minH) continue;
      const parentScore = node.G * node.G / (node.H + p.lambda);
      let bestGain = p.minGain;
      let bj = -1;
      let bb = -1;
      for (let k = 0; k < feats.length; k++) {
        const j = feats[k];
        let GL2 = 0;
        let HL2 = 0;
        for (let b = 0; b < nb[j] - 1; b++) {
          const at2 = (j * B + b) * 2;
          GL2 += node.hs[at2];
          HL2 += node.hs[at2 + 1];
          const HR = node.H - HL2;
          if (HL2 < minH) continue;
          if (HR < minH) break;
          const GR = node.G - GL2;
          const gn = GL2 * GL2 / (HL2 + p.lambda) + GR * GR / (HR + p.lambda) - parentScore;
          if (gn > bestGain) {
            bestGain = gn;
            bj = j;
            bb = b;
          }
        }
      }
      if (bj < 0) continue;
      const left = [];
      const right = [];
      for (const i of node.rows) (bins[i * d + bj] <= bb ? left : right).push(i);
      const L = Int32Array.from(left);
      const R = Int32Array.from(right);
      const small = L.length <= R.length ? L : R;
      const hsSmall = hist(small, feats);
      const hsLarge = new Float64Array(node.hs.length);
      for (let q = 0; q < hsLarge.length; q++) hsLarge[q] = node.hs[q] - hsSmall[q];
      const hsL = small === L ? hsSmall : hsLarge;
      const hsR = small === L ? hsLarge : hsSmall;
      let GL = 0;
      let HL = 0;
      for (const i of L) {
        GL += g[i];
        HL += h[i];
      }
      const li = newNode(GL, HL);
      const ri = newNode(node.G - GL, node.H - HL);
      tree.f[node.id] = bj;
      tree.t[node.id] = cuts[bj][bb];
      tree.l[node.id] = li;
      tree.r[node.id] = ri;
      splitBin[node.id] = bb;
      gain[bj] += bestGain;
      open.push({ id: li, rows: L, hs: hsL, G: GL, H: HL, depth: node.depth + 1 });
      open.push({ id: ri, rows: R, hs: hsR, G: node.G - GL, H: node.H - HL, depth: node.depth + 1 });
    }
    if (tree.f[0] < 0) break;
    for (let i = 0; i < n2; i++) {
      let k = 0;
      while (tree.f[k] >= 0) k = bins[i * d + tree.f[k]] <= splitBin[k] ? tree.l[k] : tree.r[k];
      m[i] += tree.v[k];
    }
    trees.push(tree);
    gains.push(gain);
    let score;
    if (valid && vm) {
      const vx = valid.X;
      for (let i = 0; i < valid.n; i++) {
        let k = 0;
        while (tree.f[k] >= 0) k = vx[i * d + tree.f[k]] <= tree.t[k] ? tree.l[k] : tree.r[k];
        vm[i] += tree.v[k];
      }
      score = logLossOf(vm, valid.y, valid.w);
    } else score = logLossOf(m, y, w);
    curve.push(score);
    if (!valid) bestRounds = trees.length;
    else if (score < best - 1e-7) {
      best = score;
      bestRounds = trees.length;
    } else if (trees.length - bestRounds >= p.patience) break;
    yield;
  }
  const kept = trees.slice(0, bestRounds).map((t) => ({
    f: t.f,
    t: t.t.map((v) => Math.fround(v)),
    l: t.l,
    r: t.r,
    v: t.v.map((v) => Math.round(v * 1e6) / 1e6)
  }));
  const gainByKey = {};
  for (let r = 0; r < bestRounds; r++) gains[r].forEach((gv, j) => gv > 0 && (gainByKey[keys[j]] = (gainByKey[keys[j]] ?? 0) + gv));
  return { ens: { keys: [...keys], trees: kept, gain: gainByKey }, curve, rounds: bestRounds };
}
function validEnsemble(ens, featureKeys) {
  if (!ens || typeof ens !== "object") return false;
  const e = ens;
  if (!Array.isArray(e.keys) || !Array.isArray(e.trees) || e.trees.length > 5e3) return false;
  if (!e.keys.every((k) => typeof k === "string" && featureKeys.includes(k))) return false;
  for (const t of e.trees) {
    if (!t || !Array.isArray(t.f)) return false;
    const n2 = t.f.length;
    if (n2 < 1 || n2 > 1023 || t.t?.length !== n2 || t.l?.length !== n2 || t.r?.length !== n2 || t.v?.length !== n2) return false;
    for (let i = 0; i < n2; i++) {
      const f2 = t.f[i];
      if (!Number.isInteger(f2) || f2 >= e.keys.length || !Number.isFinite(t.v[i]) || Math.abs(t.v[i]) > 20) return false;
      if (f2 >= 0) {
        if (!Number.isFinite(t.t[i]) || !(t.l[i] > i && t.l[i] < n2) || !(t.r[i] > i && t.r[i] < n2)) return false;
      }
    }
  }
  return true;
}

// src/core/model.ts
var PRIOR_MEAN = {
  age: 4.5,
  mcap: 3.6,
  progress: 0.08,
  net60: 0.3,
  net300: 0.6,
  accel: 0,
  buyRatio: 0.55,
  uniq60: 1,
  uniqTotal: 2.2,
  trades60: 1.3,
  avgBuy: -1,
  whale: 0.35,
  devShare: 0.04,
  devSold: 0.3,
  bundle: 0.05,
  early: 0.08,
  top10: 0.25,
  holders: 2.2,
  drawdown: 0.25,
  chg30: 0,
  chg120: 0,
  smart: 0.05,
  fresh: 0.3,
  socials: 0.35,
  tweet: 0.1,
  cluster: 0.3,
  leader: 0.1,
  copycat: 0.15,
  serial: 0.2,
  creatorBest: 0.1,
  heat: 0,
  hourSin: 0,
  hourCos: 0,
  liquidity: 3.5,
  sinceMig: 1,
  dex: 0.1
};
var PRIOR_STD = {
  age: 1.2,
  mcap: 0.5,
  progress: 0.15,
  net60: 1,
  net300: 1.3,
  accel: 1,
  buyRatio: 0.2,
  uniq60: 1,
  uniqTotal: 1.2,
  trades60: 1.1,
  avgBuy: 1,
  whale: 0.25,
  devShare: 0.05,
  devSold: 0.4,
  bundle: 0.1,
  early: 0.1,
  top10: 0.12,
  holders: 1.1,
  drawdown: 0.25,
  chg30: 0.15,
  chg120: 0.3,
  smart: 0.3,
  fresh: 0.25,
  socials: 0.35,
  tweet: 0.3,
  cluster: 0.6,
  leader: 0.3,
  copycat: 0.35,
  serial: 0.5,
  creatorBest: 0.3,
  heat: 1,
  hourSin: 0.7,
  hourCos: 0.7,
  liquidity: 1,
  sinceMig: 2.5,
  dex: 0.3
};
var CURVE_W = {
  age: -0.35,
  mcap: -0.15,
  progress: 0.05,
  net60: 0.45,
  net300: 0.25,
  accel: 0.2,
  buyRatio: 0.3,
  uniq60: 0.45,
  uniqTotal: 0.3,
  trades60: 0.1,
  avgBuy: -0.1,
  whale: -0.2,
  devShare: -0.35,
  devSold: -0.55,
  bundle: -0.45,
  early: -0.3,
  top10: -0.45,
  holders: 0.2,
  drawdown: -0.4,
  chg30: 0.15,
  chg120: 0.15,
  smart: 0.5,
  fresh: -0.3,
  socials: 0.15,
  tweet: 0.1,
  cluster: 0.1,
  leader: 0.2,
  copycat: -0.25,
  serial: -0.4,
  creatorBest: 0.1,
  heat: 0.15,
  hourSin: 0,
  hourCos: 0,
  liquidity: 0,
  sinceMig: 0,
  dex: 0.1
};
var AMM_W = {
  ...CURVE_W,
  age: -0.2,
  mcap: -0.2,
  progress: 0,
  bundle: -0.2,
  early: -0.15,
  devSold: -0.3,
  liquidity: 0.2,
  sinceMig: -0.25,
  dex: 0.25,
  holders: 0.3
};
function priorModel(now = 0) {
  const soften = (w) => Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v * 0.5]));
  const mk = (weights, pRef) => ({
    pRef,
    bias: logit(pRef),
    weights: soften(weights),
    mean: { ...PRIOR_MEAN },
    std: { ...PRIOR_STD }
  });
  return {
    version: "prior-2.0",
    createdAt: now,
    source: "prior",
    target: { tpPct: 100, slPct: 50, horizonMin: 360 },
    stages: { curve: mk(CURVE_W, 0.12), amm: { ...mk(AMM_W, 0.15), mean: { ...PRIOR_MEAN, liquidity: 4.6, sinceMig: 6, age: 7 } } }
  };
}
function scalePrior(base, rows) {
  const n2 = rows.length;
  const blend = n2 / (n2 + 600);
  const mean2 = {};
  const std = {};
  FEATURE_KEYS.forEach((k2, j) => {
    let m = 0;
    for (const r of rows) m += r[j];
    m /= n2;
    let v = 0;
    for (const r of rows) v += (r[j] - m) ** 2;
    const sd = Math.sqrt(v / Math.max(1, n2 - 1));
    const pm = base.mean[k2] ?? 0;
    const ps = base.std[k2] ?? 1;
    mean2[k2] = (1 - blend) * pm + blend * m;
    std[k2] = Math.max((1 - blend) * ps + blend * sd, 0.5 * ps, 1e-6);
  });
  const lin = [];
  for (const r of rows) {
    let s22 = 0;
    FEATURE_KEYS.forEach((k2, j) => {
      s22 += (base.weights[k2] ?? 0) * clamp((r[j] - mean2[k2]) / std[k2], -5, 5);
    });
    lin.push(s22);
  }
  const lm = lin.reduce((a, b) => a + b, 0) / lin.length;
  const lsd = Math.sqrt(lin.reduce((a, b) => a + (b - lm) ** 2, 0) / Math.max(1, lin.length - 1));
  const k = lsd > 1e-6 ? clamp(0.85 / lsd, 0.15, 3) : 1;
  const weights = {};
  for (const key of FEATURE_KEYS) weights[key] = (base.weights[key] ?? 0) * k;
  return { mean: mean2, std, weights, bias: base.bias - lm * k };
}
var POINTS_PER_LOGIT = 12.5 / Math.LN2;
function standardize(stage, x) {
  const z = new Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const k = FEATURE_KEYS[i];
    const sd = stage.std[k] ?? 1;
    z[i] = clamp((x[i] - (stage.mean[k] ?? 0)) / (sd > 1e-9 ? sd : 1), -5, 5);
  }
  return z;
}
function linear(stage, z) {
  let s = stage.bias;
  for (let i = 0; i < z.length; i++) s += (stage.weights[FEATURE_KEYS[i]] ?? 0) * z[i];
  return s;
}
function scoreFromLogit(stage, zLogit) {
  const sc = stage.scale;
  if (sc) return clamp(50 + 25 * (zLogit - sc.at50) / (sc.at75 - sc.at50), 0, 100);
  return clamp(50 + (zLogit - logit(stage.pRef)) * POINTS_PER_LOGIT, 0, 100);
}
function pointsPerLogit(stage) {
  return stage.scale ? 25 / (stage.scale.at75 - stage.scale.at50) : POINTS_PER_LOGIT;
}
var keyMaps = /* @__PURE__ */ new WeakMap();
function treeMap(ens) {
  let m = keyMaps.get(ens);
  if (!m) {
    m = Int32Array.from(ens.keys, (k) => FEATURE_KEYS.indexOf(k));
    keyMaps.set(ens, m);
  }
  return m;
}
function rawLogit(stage, x) {
  const lin = linear(stage, standardize(stage, x));
  return stage.trees?.trees.length ? lin + ensembleMargin(stage.trees, x, treeMap(stage.trees)) : lin;
}
function stageLogit(stage, x) {
  const raw = rawLogit(stage, x);
  return stage.calib ? stage.calib.a + stage.calib.b * raw : raw;
}
function contributionPoints(stage, x, z = standardize(stage, x)) {
  const out = new Float64Array(FEATURE_KEYS.length);
  for (let i = 0; i < out.length; i++) out[i] = (stage.weights[FEATURE_KEYS[i]] ?? 0) * z[i];
  if (stage.trees?.trees.length) ensembleContrib(stage.trees, x, out, treeMap(stage.trees));
  const k = (stage.calib?.b ?? 1) * pointsPerLogit(stage);
  for (let i = 0; i < out.length; i++) out[i] *= k;
  return out;
}
function scoreToken(model, f2, explain = true) {
  const stageKey = f2.stage;
  const stage = model.stages[stageKey];
  const x = featureVector(f2);
  const z = standardize(stage, x);
  let raw = linear(stage, z);
  if (stage.trees?.trees.length) raw += ensembleMargin(stage.trees, x, treeMap(stage.trees));
  const pLogit = stage.calib ? stage.calib.a + stage.calib.b * raw : raw;
  const p = sigmoid(pLogit);
  const score = scoreFromLogit(stage, pLogit);
  let contributions = [];
  if (explain) {
    const pts2 = contributionPoints(stage, x, z);
    for (let i = 0; i < FEATURE_DEFS.length; i++) {
      const d = FEATURE_DEFS[i];
      const v = pts2[i];
      if (Math.abs(v) < 0.5) continue;
      contributions.push({ key: d.key, label: d.label, value: d.show(f2), points: v, note: v > 0 ? d.good : d.bad });
    }
    contributions.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
    contributions = contributions.slice(0, 10);
  }
  return { score, p, calibrated: !!stage.calib && model.source === "trained", stage: stageKey, contributions };
}
function scoreVector(model, stage, x) {
  const st = model.stages[stage];
  const l = stageLogit(st, x);
  return { score: scoreFromLogit(st, l), p: sigmoid(l) };
}
function breakEvenP(tpPct, slPct, slSlippage = 0.1) {
  const win = tpPct / 100;
  const loss = slPct / 100 + slSlippage;
  return loss / (win + loss);
}
function validateModel(m) {
  if (!m || typeof m !== "object") return false;
  const s = m.stages;
  if (!s || !s.curve || !s.amm) return false;
  for (const st of [s.curve, s.amm]) {
    if (typeof st.bias !== "number" || !Number.isFinite(st.bias)) return false;
    if (typeof st.pRef !== "number" || !(st.pRef > 0 && st.pRef < 1)) return false;
    for (const k of FEATURE_KEYS) {
      const w = st.weights[k] ?? 0;
      if (!Number.isFinite(w) || Math.abs(w) > 20) return false;
      if (!Number.isFinite(st.mean[k] ?? 0) || !Number.isFinite(st.std[k] ?? 1)) return false;
    }
    if (st.calib && !(Number.isFinite(st.calib.a) && Number.isFinite(st.calib.b))) return false;
    if (st.scale && !(Number.isFinite(st.scale.at50) && Number.isFinite(st.scale.at75) && st.scale.at75 - st.scale.at50 > 1e-3)) return false;
    if (st.trees !== void 0 && !validEnsemble(st.trees, FEATURE_KEYS)) return false;
  }
  return true;
}

// src/core/narratives.ts
var STOP = /* @__PURE__ */ new Set([
  "the",
  "coin",
  "token",
  "official",
  "sol",
  "solana",
  "meme",
  "pump",
  "fun",
  "of",
  "and",
  "on",
  "in",
  "a",
  "an",
  "is",
  "to",
  "for",
  "my",
  "inu",
  "ai",
  "cto",
  "real",
  "new",
  "just",
  "by",
  "with",
  "com",
  "www"
]);
function normalizeWord(s) {
  return s.normalize("NFKD").toLowerCase().replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}
function narrativeKeys(name, symbol, twitter) {
  const keys = /* @__PURE__ */ new Set();
  const sym = normalizeWord(symbol);
  if (sym.length >= 2 && sym.length <= 14) keys.add(`t:${sym}`);
  const words = name.split(/[\s_\-.,!?/|]+/).map(normalizeWord).filter((w) => w.length >= 3 && !STOP.has(w));
  for (const w of words.slice(0, 4)) keys.add(`w:${w}`);
  const full = normalizeWord(name);
  if (full.length >= 4 && full.length <= 24 && words.length > 1) keys.add(`w:${full}`);
  if (twitter) {
    const status = /(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/i.exec(twitter);
    if (status) keys.add(`tw:${status[2]}`);
    else {
      const handle = /(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})\/?(?:$|\?)/i.exec(twitter);
      if (handle && !["home", "i", "search", "intent"].includes(handle[1].toLowerCase())) keys.add(`x:${handle[1].toLowerCase()}`);
    }
  }
  return [...keys];
}
var NarrativeIndex = class {
  constructor(windowMs = 60 * 6e4) {
    this.windowMs = windowMs;
  }
  launches = [];
  byKey = /* @__PURE__ */ new Map();
  firstByKey = /* @__PURE__ */ new Map();
  keysByMint = /* @__PURE__ */ new Map();
  add(mint, ts, name, symbol, twitter) {
    const prev = this.keysByMint.get(mint);
    const keys = narrativeKeys(name, symbol, twitter);
    if (prev) {
      const extra = keys.filter((k) => !prev.includes(k));
      if (extra.length === 0) return;
      prev.push(...extra);
      for (const k of extra) this.link(k, mint, ts);
      return;
    }
    this.keysByMint.set(mint, keys);
    this.launches.push({ ts, mint, keys });
    for (const k of keys) this.link(k, mint, ts);
  }
  link(k, mint, ts) {
    let set = this.byKey.get(k);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.byKey.set(k, set);
    }
    set.add(mint);
    const first = this.firstByKey.get(k);
    if (!first || ts < first.ts) this.firstByKey.set(k, { mint, ts });
  }
  prune(now) {
    const cutoff = now - this.windowMs;
    let i = 0;
    while (i < this.launches.length && this.launches[i].ts < cutoff) {
      const l = this.launches[i];
      for (const k of this.keysByMint.get(l.mint) ?? l.keys) {
        const set = this.byKey.get(k);
        if (set) {
          set.delete(l.mint);
          if (set.size === 0) {
            this.byKey.delete(k);
            this.firstByKey.delete(k);
          } else if (this.firstByKey.get(k)?.mint === l.mint) {
            this.firstByKey.set(k, { mint: [...set][0], ts: cutoff });
          }
        }
      }
      this.keysByMint.delete(l.mint);
      i++;
    }
    if (i > 0) this.launches.splice(0, i);
  }
  /** Narrative facts for one token; `mcapOf` resolves current market caps. */
  describe(mint, mcapOf) {
    const keys = this.keysByMint.get(mint);
    if (!keys || keys.length === 0) return { clusterKey: null, clusterSize: 1, isLeader: true, isFirst: true, tweetLinked: false };
    let bestKey = null;
    let bestSize = 1;
    for (const k of keys) {
      const n2 = this.byKey.get(k)?.size ?? 1;
      if (n2 > bestSize || n2 === bestSize && bestKey === null) {
        bestSize = n2;
        bestKey = k;
      }
    }
    let isLeader = true;
    let isFirst = true;
    if (bestKey && bestSize > 1) {
      const myMcap = mcapOf(mint);
      for (const other of this.byKey.get(bestKey) ?? []) {
        if (other !== mint && mcapOf(other) > myMcap) {
          isLeader = false;
          break;
        }
      }
      isFirst = this.firstByKey.get(bestKey)?.mint === mint;
    }
    return { clusterKey: bestSize > 1 ? bestKey : null, clusterSize: bestSize, isLeader, isFirst, tweetLinked: keys.some((k) => k.startsWith("tw:")) };
  }
  /** Hottest clusters right now (≥ 2 launches), with their current leader. */
  hot(limit, mcapOf) {
    const rows = [];
    for (const [key, set] of this.byKey) {
      if (set.size < 2) continue;
      let leader = null;
      let leaderMcap = 0;
      for (const m of set) {
        const mc = mcapOf(m);
        if (mc > leaderMcap) {
          leaderMcap = mc;
          leader = m;
        }
      }
      const first = this.firstByKey.get(key);
      rows.push({ key, size: set.size, leader, leaderMcap, firstMint: first?.mint ?? null, firstTs: first?.ts ?? 0, mints: [...set].slice(0, 20) });
    }
    rows.sort((a, b) => b.size - a.size || b.leaderMcap - a.leaderMcap);
    return rows.slice(0, limit);
  }
  get size() {
    return this.launches.length;
  }
};

// src/core/positions.ts
var DEFAULT_COSTS = { priorityFeeSol: 5e-4, platformFeePct: 0.5, ataRentSol: 203928e-8, refundRent: true };
function venueOf(t) {
  if (t.stage === "curve") return t.vTok > 0 && t.realTok > 0 ? "curve" : "none";
  if (t.stage === "migrating") return "none";
  if (t.poolBase > 0 && t.poolQuote > 0) return "amm";
  if (t.quote?.priceSol && t.quote.priceSol > 0) return "approx";
  return "none";
}
function approxPool(t, solUsd) {
  const q = t.quote;
  const liqSol = q.liqUsd && solUsd > 0 ? q.liqUsd / solUsd / 2 : 50;
  const quote = Math.max(1, liqSol) * LAMPORTS_PER_SOL;
  const base = quote / (q.priceSol * LAMPORTS_PER_SOL) * RAW_PER_TOKEN;
  return { base, quote, supply: t.supply };
}
function quoteBuy(t, lamportsAllIn, costs, solUsd = 0, firstBuy = true) {
  const venue = venueOf(t);
  const fixed = costs.priorityFeeSol * LAMPORTS_PER_SOL + (firstBuy ? costs.ataRentSol * LAMPORTS_PER_SOL : 0);
  const platform = lamportsAllIn * (costs.platformFeePct / 100);
  const swapIn = Math.floor(lamportsAllIn - fixed - platform);
  if (venue === "none") return { ok: false, error: t.stage === "migrating" ? "migrating" : "no_price", tokens: 0, lamports: 0, avgPriceSol: 0, fees: 0, mcapSol: t.mcapSol };
  if (swapIn <= 1e4) return { ok: false, error: "size_too_small", tokens: 0, lamports: 0, avgPriceSol: 0, fees: 0, mcapSol: t.mcapSol };
  let q;
  if (venue === "curve") q = curveBuyQuote(t, swapIn);
  else if (venue === "amm") q = poolBuyQuote({ base: t.poolBase, quote: t.poolQuote, supply: t.supply }, swapIn);
  else q = poolBuyQuote(approxPool(t, solUsd), swapIn);
  if (q.tokensOut <= 0) return { ok: false, error: "no_liquidity", tokens: 0, lamports: 0, avgPriceSol: 0, fees: 0, mcapSol: t.mcapSol };
  const lamports = q.solSpent + fixed + platform;
  return {
    ok: true,
    tokens: q.tokensOut,
    lamports,
    avgPriceSol: lamports / LAMPORTS_PER_SOL / (q.tokensOut / RAW_PER_TOKEN),
    fees: q.feeLamports + fixed + platform,
    mcapSol: t.mcapSol
  };
}
function quoteSell(t, tokens, costs, solUsd = 0, closesAccount = false) {
  const venue = venueOf(t);
  if (tokens <= 0) return { ok: true, tokens: 0, lamports: 0, avgPriceSol: 0, fees: 0, mcapSol: t.mcapSol };
  if (venue === "none") return { ok: false, error: t.stage === "migrating" ? "migrating" : "no_price", tokens, lamports: 0, avgPriceSol: 0, fees: 0, mcapSol: t.mcapSol };
  let q;
  if (venue === "curve") q = curveSellQuote(t, tokens);
  else if (venue === "amm") q = poolSellQuote({ base: t.poolBase, quote: t.poolQuote, supply: t.supply }, tokens);
  else q = poolSellQuote(approxPool(t, solUsd), tokens);
  const platform = q.solOut * (costs.platformFeePct / 100);
  const refund = closesAccount && costs.refundRent ? costs.ataRentSol * LAMPORTS_PER_SOL : 0;
  const lamports = Math.max(0, q.solOut - platform - costs.priorityFeeSol * LAMPORTS_PER_SOL + refund);
  return {
    ok: true,
    tokens,
    lamports,
    avgPriceSol: tokens > 0 ? lamports / LAMPORTS_PER_SOL / (tokens / RAW_PER_TOKEN) : 0,
    fees: q.feeLamports + platform + costs.priorityFeeSol * LAMPORTS_PER_SOL,
    mcapSol: t.mcapSol
  };
}
function positionMultiple(p) {
  return p.cost > 0 ? (p.proceeds + p.value) / p.cost : 0;
}
function effectiveTrail(plan) {
  return plan.takeInitials && plan.trailPct === 0 ? 40 : plan.trailPct;
}
function decideExit(p, now, lastTradeAt = now) {
  const plan = p.plan;
  const mult = positionMultiple(p);
  if (p.tokensLeft <= 0) return { action: "hold" };
  if (!p.tpHit && mult <= 1 - plan.slPct / 100) return { action: "sell", fraction: 1, reason: "sl" };
  const trail = effectiveTrail(plan);
  if (!p.tpHit && mult >= 1 + plan.tpPct / 100) {
    if (plan.takeInitials && p.value > 0) {
      const need = Math.max(0, p.cost - p.proceeds);
      const fraction = Math.min(1, need / p.value);
      if (fraction < 0.98) return { action: "sell", fraction, reason: "initials" };
      return { action: "sell", fraction: 1, reason: "tp" };
    }
    if (trail > 0) return { action: "arm" };
    return { action: "sell", fraction: 1, reason: "tp" };
  }
  if (p.tpHit && trail > 0 && p.peakValue > 0 && p.value <= p.peakValue * (1 - trail / 100)) {
    return { action: "sell", fraction: 1, reason: "trail" };
  }
  if (p.tpHit && mult <= 1 - plan.slPct / 100) return { action: "sell", fraction: 1, reason: "sl" };
  if (plan.maxHoldMin > 0 && now - p.openedAt >= plan.maxHoldMin * 6e4) return { action: "sell", fraction: 1, reason: "time" };
  const stale = plan.staleExitMin ?? 0;
  if (stale > 0 && now - Math.max(lastTradeAt, p.openedAt) >= stale * 6e4) return { action: "sell", fraction: 1, reason: "dead" };
  return { action: "hold" };
}

// src/core/outcomes.ts
var GRID_TP = [25, 50, 75, 100, 150, 200, 300, 500];
var GRID_SL = [10, 20, 30, 40, 50, 70];
var GRID = GRID_TP.flatMap((tp) => GRID_SL.map((sl) => ({ tp, sl })));
var GRID_VERSION = 2;
var PATH_MIN = [5, 10, 30, 60, 120];
var ENTRY_LEVELS = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95];
var SLOT = 5;
var STATE = 0;
var KIND = 1;
var EXIT_AT = 2;
var TIME = 3;
var RET = 4;
var KINDS = ["timeout", "tp", "sl", "dead"];
var K_TP = 1;
var K_SL = 2;
var COMBOS = 1 + GRID.length;
var TP_UP = Float64Array.from(GRID, (g) => 1 + g.tp / 100);
var SL_DOWN = Float64Array.from(GRID, (g) => 1 - g.sl / 100);
function comboObserved(s, gi) {
  const t = s.gridT?.[gi];
  return seenAt(s, t ?? Infinity);
}
function counts(s, exitSec, windowSec = Infinity) {
  if (s.ov === void 0 && s.stage === "amm") return false;
  if (s.blind === void 0) return true;
  if (s.stage === "amm" || s.blindBy === "feed") return windowSec <= s.blind;
  return Math.min(exitSec, windowSec) <= s.blind;
}
function comboCounts(s, gi) {
  return counts(s, s.gridT?.[gi] ?? Infinity);
}
function seenAt(s, sec) {
  if (s.ov === void 0 && s.stage === "amm") return false;
  return s.blind === void 0 || sec <= s.blind;
}
var r4 = (v) => Math.round(v * 1e4) / 1e4;
var OutcomeTracker = class {
  constructor(opts, sink) {
    this.opts = opts;
    this.sink = sink;
  }
  byMint = /* @__PURE__ */ new Map();
  openCount = 0;
  dropped = 0;
  resolvedCount = 0;
  setOptions(o) {
    this.opts = { ...this.opts, ...o };
  }
  get open() {
    return this.openCount;
  }
  has(mint, tag) {
    return this.byMint.get(mint)?.some((h) => h.tag === tag) ?? false;
  }
  /** Coins with would-be trades still being followed. */
  openMints() {
    return this.byMint.keys();
  }
  /**
   * The coin's price no longer reaches us (its pool is not followed any more): its would-be
   * trades keep their exits up to `at`; what happens after is unknown. Not yet entered ones are
   * dropped — their entry could not be seen.
   */
  blindMint(mint, at2, by = "pool") {
    const list = this.byMint.get(mint);
    if (!list) return;
    for (const h of [...list]) {
      if (!h.entered) {
        this.remove(h);
        continue;
      }
      if (h.blind !== void 0) continue;
      h.blind = Math.max(at2, h.ts);
      h.blindBy = by;
      for (let i = 0; i < COMBOS; i++) if (h.c[i * SLOT + STATE] === 1) this.resolveCombo(h, i, h.lastM);
      if (h.open === 0) this.emit(h, at2);
    }
  }
  /** The trade feed went quiet at `at`: nothing open is observed from then on. */
  blindAll(at2) {
    for (const mint of [...this.byMint.keys()]) this.blindMint(mint, at2, "feed");
  }
  add(t, kind, tag, now, score, p, x, custom, facts) {
    if (this.openCount >= this.opts.maxOpen) {
      this.dropped++;
      return false;
    }
    const h = {
      id: newId("h"),
      kind,
      tag,
      mint: t.mint,
      symbol: t.symbol,
      ts: now,
      stage: t.stage === "amm" ? "amm" : "curve",
      score,
      p,
      x,
      entryAt: now + this.opts.latencyMs,
      entered: false,
      entryMcap: 0,
      a: 0,
      b: 0,
      maxMult: 1,
      minMult: 1,
      maxAt: now,
      ctp: custom.tp,
      csl: custom.sl,
      c: new Float64Array(COMBOS * SLOT),
      open: COMBOS,
      path: PATH_MIN.map(() => null),
      pathNext: 0,
      f: facts,
      lastM: 1
    };
    let list = this.byMint.get(t.mint);
    if (!list) {
      list = [];
      this.byMint.set(t.mint, list);
    }
    list.push(h);
    this.openCount++;
    if (this.opts.latencyMs === 0) this.enter(h, t, now);
    return true;
  }
  enter(h, t, now) {
    const size = this.opts.sizeSol * LAMPORTS_PER_SOL;
    const q = quoteBuy(t, size, this.opts.costs, 0, true);
    if (!q.ok || q.tokens <= 0 || t.mcapSol <= 0) {
      this.remove(h);
      return;
    }
    h.entered = true;
    h.entryMcap = t.mcapSol;
    const sellFee = (t.stage === "amm" ? 0.0125 : 0.0125) + this.opts.costs.platformFeePct / 100;
    const tokensUi = q.tokens / 1e6;
    const pricePerMcap = 1e6 / t.supply;
    h.a = tokensUi * pricePerMcap * (1 - sellFee) / this.opts.sizeSol;
    h.b = (this.opts.costs.priorityFeeSol - (this.opts.costs.refundRent ? this.opts.costs.ataRentSol : 0)) / this.opts.sizeSol;
    h.ts = now;
    h.lastM = this.mult(h, t.mcapSol);
  }
  mult(h, mcap) {
    return h.a * mcap - h.b;
  }
  /** Records the value at each time-exit horizon that has passed (and keeps the extremes in step). */
  capturePath(h, now, m) {
    if (m > h.maxMult) {
      h.maxMult = m;
      h.maxAt = now;
    }
    if (m < h.minMult) h.minMult = m;
    while (h.pathNext < PATH_MIN.length && now - h.ts >= PATH_MIN[h.pathNext] * 6e4) h.path[h.pathNext++] = Math.max(-1, m - 1);
  }
  /** Price update for a token (call after every applied trade / quote). */
  onPrice(t, now) {
    const list = this.byMint.get(t.mint);
    if (!list) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i];
      if (!h.entered) {
        if (now >= h.entryAt) this.enter(h, t, now);
        continue;
      }
      if (t.stage === "migrating") continue;
      const m = this.mult(h, t.mcapSol);
      if (h.blind === void 0) h.lastM = m;
      if (m > h.maxMult) {
        h.maxMult = m;
        h.maxAt = now;
      }
      if (m < h.minMult) h.minMult = m;
      this.capturePath(h, now, m);
      const c = h.c;
      for (let i2 = 0; i2 < COMBOS; i2++) {
        const o = i2 * SLOT;
        const state = c[o + STATE];
        if (state === 2) continue;
        if (state === 1) {
          if (now >= c[o + EXIT_AT]) this.resolveCombo(h, i2, m);
          continue;
        }
        if (m >= (i2 === 0 ? 1 + h.ctp / 100 : TP_UP[i2 - 1])) this.trigger(h, i2, K_TP, now, m);
        else if (m <= (i2 === 0 ? 1 - h.csl / 100 : SL_DOWN[i2 - 1])) this.trigger(h, i2, K_SL, now, m);
      }
      if (now - h.ts >= this.opts.horizonMs) this.finish(h, m, "timeout", now);
      else if (h.open === 0) this.emit(h, now);
    }
  }
  trigger(h, i, kind, now, m) {
    const o = i * SLOT;
    h.c[o + KIND] = kind;
    h.c[o + TIME] = (now - h.ts) / 1e3;
    if (this.opts.latencyMs <= 0) this.resolveCombo(h, i, m);
    else {
      h.c[o + STATE] = 1;
      h.c[o + EXIT_AT] = now + this.opts.latencyMs;
    }
  }
  resolveCombo(h, i, m) {
    const o = i * SLOT;
    if (h.c[o + STATE] === 2) return;
    h.c[o + STATE] = 2;
    h.c[o + RET] = Math.max(-1, m - 1);
    h.open--;
  }
  finish(h, m, kind, now) {
    const end = Math.min(now, h.ts + this.opts.horizonMs);
    this.capturePath(h, end, m);
    for (let i = 0; i < COMBOS; i++) {
      const o = i * SLOT;
      const state = h.c[o + STATE];
      if (state === 2) continue;
      if (state === 0) {
        h.c[o + KIND] = KINDS.indexOf(kind);
        h.c[o + TIME] = (end - h.ts) / 1e3;
      }
      this.resolveCombo(h, i, m);
    }
    this.emit(h, h.ts + this.opts.horizonMs);
  }
  emit(h, now) {
    this.remove(h);
    if (!h.entered) return;
    const c = h.c;
    const kind0 = KINDS[c[KIND]];
    const grid = [];
    const gridT = [];
    for (let i = 1; i < COMBOS; i++) {
      grid.push(r4(c[i * SLOT + RET]));
      gridT.push(Math.round(Math.max(0, c[i * SLOT + TIME]) * 10) / 10);
    }
    this.resolvedCount++;
    this.sink({
      id: h.id,
      kind: h.kind,
      tag: h.tag,
      mint: h.mint,
      symbol: h.symbol,
      ts: h.ts,
      stage: h.stage,
      score: h.score,
      p: h.p,
      x: h.x,
      entryMcap: h.entryMcap,
      tp: h.ctp,
      sl: h.csl,
      y: kind0 === "tp" ? 1 : 0,
      ret: c[RET],
      exit: kind0,
      grid,
      gv: GRID_VERSION,
      gridT,
      path: h.path.map((v) => v === null ? null : r4(v)),
      f: h.f,
      ...h.blind !== void 0 ? { blind: Math.round((h.blind - h.ts) / 100) / 10, blindBy: h.blindBy } : {},
      ov: 1,
      maxMult: h.maxMult,
      minMult: h.minMult,
      secToMax: Math.max(0, (h.maxAt - h.ts) / 1e3),
      resolvedAt: now
    });
  }
  remove(h) {
    const list = this.byMint.get(h.mint);
    if (!list) return;
    const i = list.indexOf(h);
    if (i >= 0) {
      list.splice(i, 1);
      this.openCount--;
    }
    if (list.length === 0) this.byMint.delete(h.mint);
  }
  /** Token left memory (idle/dead): resolve everything at its last value. */
  onTokenGone(t, now) {
    const list = this.byMint.get(t.mint);
    if (!list) return;
    for (const h of [...list]) {
      if (!h.entered) {
        this.remove(h);
        continue;
      }
      this.finish(h, this.mult(h, t.mcapSol), "dead", now);
    }
  }
  /** Periodic sweep: time out hypotheticals of tokens that stopped trading. */
  sweep(now, tokenOf) {
    for (const [mint, list] of [...this.byMint]) {
      const t = tokenOf(mint);
      for (const h of [...list]) {
        if (!h.entered) {
          if (t && now >= h.entryAt) this.enter(h, t, now);
          else if (!t) this.remove(h);
          continue;
        }
        const m = t ? this.mult(h, t.mcapSol) : h.minMult;
        this.capturePath(h, now, m);
        for (let i = 0; i < COMBOS; i++) if (h.c[i * SLOT + STATE] === 1 && now >= h.c[i * SLOT + EXIT_AT]) this.resolveCombo(h, i, m);
        if (h.open === 0) this.emit(h, now);
        else if (now - h.ts >= this.opts.horizonMs) this.finish(h, m, "timeout", now);
      }
    }
  }
};

// src/core/settings.ts
var ENTRY_POINTS = {
  age20: "20 s after launch",
  age45: "45 s after launch",
  age90: "90 s after launch",
  age180: "3 min after launch",
  age360: "6 min after launch",
  age720: "12 min after launch",
  prog25: "a quarter of the way to graduation",
  prog50: "halfway to graduation",
  prog75: "three quarters of the way to graduation",
  mig60: "1 min after graduating",
  mig300: "5 min after graduating",
  mig900: "15 min after graduating",
  mig3600: "1 h after graduating"
};
var MAX_MOMENTS = 4;
var MOMENT_RANGE = { age: [10, 86400], mig: [30, 86400] };
function snapMomentSec(sec) {
  if (sec < 120) return Math.round(sec);
  if (sec < 7200) return Math.round(sec / 30) * 30;
  return Math.round(sec / 1800) * 1800;
}
function customMoment(tag) {
  const m = /^(age|mig)(\d{1,6})$/.exec(tag);
  if (!m || tag in ENTRY_POINTS) return null;
  const kind = m[1];
  const sec = Number(m[2]);
  const [lo, hi] = MOMENT_RANGE[kind];
  return sec >= lo && sec <= hi && snapMomentSec(sec) === sec ? { kind, sec } : null;
}
function isMomentTag(tag) {
  return tag in ENTRY_POINTS || customMoment(tag) !== null;
}
var duration = (sec) => sec < 120 ? `${sec} s` : sec < 7200 ? `${+(sec / 60).toFixed(1)} min` : `${+(sec / 3600).toFixed(1)} h`;
function entryLabel(tag) {
  const fixed = ENTRY_POINTS[tag];
  if (fixed) return fixed;
  const c = customMoment(tag);
  return c ? `${duration(c.sec)} after ${c.kind === "age" ? "launch" : "graduating"}` : tag;
}
function tagOfLabel(label) {
  for (const [k, v] of Object.entries(ENTRY_POINTS)) if (v === label) return k;
  const m = /^(\d+(?:\.\d+)?) (s|min|h) after (launch|graduating)$/.exec(label);
  if (!m) return null;
  const sec = Math.round(Number(m[1]) * (m[2] === "s" ? 1 : m[2] === "min" ? 60 : 3600));
  const tag = `${m[3] === "launch" ? "age" : "mig"}${sec}`;
  return isMomentTag(tag) ? tag : null;
}
var DEFAULT_SETTINGS = {
  enabled: false,
  mode: "paper",
  minScore: 75,
  entryAt: "score",
  moments: [],
  conds: [],
  scoreOnly: false,
  tradeCurve: true,
  tradeAmm: true,
  tpPct: 100,
  slPct: 50,
  trailPct: 0,
  takeInitials: false,
  maxHoldMin: 240,
  staleExitMin: 10,
  positionSol: 0.1,
  maxOpen: 3,
  maxDailyLossSol: 0.5,
  maxTradesPerHour: 12,
  slippagePct: 20,
  exitSlippagePct: 25,
  priorityFeeSol: 5e-4,
  platformFeePct: 0.5,
  // hold ~5 s (one evaluation per second while the coin trades): in simulation, buying on the
  // first tick above the line caught more one-off spikes and did 2–6 points worse per trade
  confirmTicks: 5,
  retryWindowSec: 20,
  reentry: false,
  paperLatencyMs: 1500,
  autoTune: false,
  autopilot: true,
  filters: {
    minMcapSol: 0,
    maxMcapSol: 0,
    maxDevPct: 20,
    maxTop10Pct: 60,
    maxBundlePct: 25,
    minBuyers: 5,
    minAgeSec: 0,
    maxAgeMin: 0,
    requireSocials: false,
    maxDevLaunches24h: 5,
    maxDevSoldPct: 100
  }
};
var LIMITS = {
  positionSol: [1e-3, 100],
  maxOpen: [1, 50],
  tpPct: [1, 1e4],
  slPct: [1, 99],
  slippagePct: [0.5, 99],
  exitSlippagePct: [1, 99],
  priorityFeeSol: [0, 0.1],
  platformFeePct: [0, 5],
  maxHoldMin: [0, 10080],
  paperLatencyMs: [0, 3e4]
};
function bool(v, d) {
  return typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : d;
}
function sanitizeSettings(input, base = DEFAULT_SETTINGS) {
  const i = input && typeof input === "object" ? input : {};
  const f2 = i.filters && typeof i.filters === "object" ? i.filters : {};
  const b = base;
  const bf = base.filters;
  const out = {
    enabled: bool(i.enabled, b.enabled),
    mode: i.mode === "live" || i.mode === "paper" ? i.mode : b.mode,
    minScore: clamp(num(i.minScore, b.minScore), 0, 100),
    entryAt: i.entryAt === "score" || typeof i.entryAt === "string" && isMomentTag(i.entryAt) ? i.entryAt : b.entryAt,
    moments: sanitizeMoments(i.moments, b.moments),
    conds: sanitizeConds(i.conds, b.conds),
    scoreOnly: bool(i.scoreOnly, b.scoreOnly),
    tradeCurve: bool(i.tradeCurve, b.tradeCurve),
    tradeAmm: bool(i.tradeAmm, b.tradeAmm),
    tpPct: clamp(num(i.tpPct, b.tpPct), ...LIMITS.tpPct),
    slPct: clamp(num(i.slPct, b.slPct), ...LIMITS.slPct),
    trailPct: clamp(num(i.trailPct, b.trailPct), 0, 95),
    takeInitials: bool(i.takeInitials, b.takeInitials),
    maxHoldMin: clamp(num(i.maxHoldMin, b.maxHoldMin), ...LIMITS.maxHoldMin),
    staleExitMin: clamp(num(i.staleExitMin, b.staleExitMin), 0, 1440),
    positionSol: clamp(num(i.positionSol, b.positionSol), ...LIMITS.positionSol),
    maxOpen: Math.round(clamp(num(i.maxOpen, b.maxOpen), ...LIMITS.maxOpen)),
    maxDailyLossSol: clamp(num(i.maxDailyLossSol, b.maxDailyLossSol), 0, 1e3),
    maxTradesPerHour: Math.round(clamp(num(i.maxTradesPerHour, b.maxTradesPerHour), 1, 500)),
    slippagePct: clamp(num(i.slippagePct, b.slippagePct), ...LIMITS.slippagePct),
    exitSlippagePct: clamp(num(i.exitSlippagePct, b.exitSlippagePct), ...LIMITS.exitSlippagePct),
    priorityFeeSol: clamp(num(i.priorityFeeSol, b.priorityFeeSol), ...LIMITS.priorityFeeSol),
    platformFeePct: clamp(num(i.platformFeePct, b.platformFeePct), ...LIMITS.platformFeePct),
    confirmTicks: Math.round(clamp(num(i.confirmTicks, b.confirmTicks), 1, 20)),
    retryWindowSec: clamp(num(i.retryWindowSec, b.retryWindowSec), 0, 600),
    reentry: bool(i.reentry, b.reentry),
    paperLatencyMs: clamp(num(i.paperLatencyMs, b.paperLatencyMs), ...LIMITS.paperLatencyMs),
    autoTune: bool(i.autoTune, b.autoTune),
    autopilot: bool(i.autopilot, b.autopilot),
    filters: {
      minMcapSol: clamp(num(f2.minMcapSol, bf.minMcapSol), 0, 1e7),
      maxMcapSol: clamp(num(f2.maxMcapSol, bf.maxMcapSol), 0, 1e7),
      maxDevPct: clamp(num(f2.maxDevPct, bf.maxDevPct), 0, 100),
      maxTop10Pct: clamp(num(f2.maxTop10Pct, bf.maxTop10Pct), 0, 100),
      maxBundlePct: clamp(num(f2.maxBundlePct, bf.maxBundlePct), 0, 100),
      minBuyers: Math.round(clamp(num(f2.minBuyers, bf.minBuyers), 0, 1e4)),
      minAgeSec: clamp(num(f2.minAgeSec, bf.minAgeSec), 0, 86400),
      maxAgeMin: clamp(num(f2.maxAgeMin, bf.maxAgeMin), 0, 1e5),
      requireSocials: bool(f2.requireSocials, bf.requireSocials),
      maxDevLaunches24h: Math.round(clamp(num(f2.maxDevLaunches24h, bf.maxDevLaunches24h), 0, 1e3)),
      maxDevSoldPct: clamp(num(f2.maxDevSoldPct, bf.maxDevSoldPct), 0, 100)
    }
  };
  if (!out.tradeCurve && !out.tradeAmm) out.tradeCurve = true;
  if (customMoment(out.entryAt) && !out.moments.includes(out.entryAt)) {
    out.moments.push(out.entryAt);
    while (out.moments.length > MAX_MOMENTS) out.moments.splice(out.moments.findIndex((m) => m !== out.entryAt), 1);
  }
  return out;
}
function sanitizeMoments(v, d = []) {
  if (!Array.isArray(v)) return [...d];
  const out = [];
  for (const m of v) if (typeof m === "string" && customMoment(m) && !out.includes(m)) out.push(m);
  return out.slice(-MAX_MOMENTS);
}
function sanitizeConds(v, d = []) {
  if (!Array.isArray(v)) return d.map((c) => ({ ...c }));
  const out = [];
  for (const c of v) {
    if (!c || typeof c !== "object") continue;
    const { k, op, v: val } = c;
    if (typeof k === "string" && FEATURE_KEYS.includes(k) && (op === ">=" || op === "<=") && typeof val === "number" && Number.isFinite(val)) out.push({ k, op, v: val });
    if (out.length === 3) break;
  }
  return out;
}
function filterBlock(f2, x) {
  if (f2.minMcapSol > 0 && x.mcap < f2.minMcapSol) return "filter:mcap_min";
  if (f2.maxMcapSol > 0 && x.mcap > f2.maxMcapSol) return "filter:mcap_max";
  if (x.devShare * 100 > f2.maxDevPct) return "filter:dev";
  if (x.top10 * 100 > f2.maxTop10Pct) return "filter:top10";
  if (x.bundle * 100 > f2.maxBundlePct) return "filter:bundle";
  if (x.buyers < f2.minBuyers) return "filter:buyers";
  if (f2.minAgeSec > 0 && x.age < f2.minAgeSec) return "filter:age_min";
  if (f2.maxAgeMin > 0 && x.age > f2.maxAgeMin * 60) return "filter:age_max";
  if (f2.requireSocials && x.socials === 0) return "filter:socials";
  if (f2.maxDevLaunches24h > 0 && x.launches24h > f2.maxDevLaunches24h) return "filter:serial_dev";
  if (f2.maxDevSoldPct < 100 && x.devSold * 100 > f2.maxDevSoldPct) return "filter:dev_sold";
  return null;
}
var RULE_KEYS = ["entryAt", "conds", "minScore", "tpPct", "slPct", "maxHoldMin", "trailPct", "takeInitials", "reentry", "tradeCurve", "tradeAmm", "scoreOnly", "filters"];
function ruleOf(s) {
  const out = {};
  for (const k of RULE_KEYS) out[k] = k === "filters" ? { ...s.filters } : k === "conds" ? (s.conds ?? []).map((c) => ({ ...c })) : s[k];
  return out;
}
function ruleChanged(a, b) {
  return JSON.stringify(ruleOf(a)) !== JSON.stringify(ruleOf(b));
}
function ruleKey(s) {
  const text = JSON.stringify(ruleOf(s));
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
function condsHold(conds, x) {
  for (const c of conds) {
    const v = x[FEATURE_KEYS.indexOf(c.k)];
    if (v === void 0 || !Number.isFinite(v)) return false;
    if (c.op === ">=" ? v < c.v - 1e-9 : v > c.v + 1e-9) return false;
  }
  return true;
}
function exitPlanFrom(s) {
  return {
    tpPct: s.tpPct,
    slPct: s.slPct,
    trailPct: s.trailPct,
    takeInitials: s.takeInitials,
    maxHoldMin: s.maxHoldMin,
    staleExitMin: s.staleExitMin,
    exitSlippagePct: s.exitSlippagePct
  };
}

// src/core/token.ts
var BUCKET_MS = 5e3;
var BUCKETS = 144;
var MAX_HOLDERS_TRACKED = 6e3;
var TokenState = class _TokenState {
  mint;
  name = "";
  symbol = "";
  uri = "";
  creator = "";
  createdAt;
  createSlot;
  createSig;
  /** true when first seen through a trade, not the create event */
  partial = false;
  nonSol = false;
  stage = "curve";
  vSol = CURVE.initialVirtualSol;
  vTok = CURVE.initialVirtualTok;
  realTok = CURVE.initialRealTok;
  supply = CURVE.supply;
  pool;
  poolBase = 0;
  poolQuote = 0;
  mcapSol = 0;
  priceSol = 0;
  firstMcapSol = 0;
  athMcapSol = 0;
  athAt = 0;
  lastTradeAt = 0;
  lastEventAt = 0;
  completeAt;
  migrateAt;
  tradeCount = 0;
  buyCount = 0;
  sellCount = 0;
  buySolTotal = 0;
  sellSolTotal = 0;
  uniqueBuyers = 0;
  holders = /* @__PURE__ */ new Map();
  devBal = 0;
  devMaxBal = 0;
  devSoldTok = 0;
  devBoughtSol = 0;
  bundleTok = 0;
  bundleBuyers = 0;
  earlyTok = 0;
  earlyBuyers = 0;
  freshBuys = 0;
  knownBuys = 0;
  maxBuySol = 0;
  meta = {};
  quote;
  trades = new Ring(120);
  buckets = Array.from({ length: BUCKETS }, () => ({ t: -1, buySol: 0, sellSol: 0, buyN: 0, sellN: 0, close: 0, high: 0, low: 0 }));
  constructor(mint, ts) {
    this.mint = mint;
    this.createdAt = ts;
    this.lastEventAt = ts;
    this.refreshPrice();
    this.firstMcapSol = this.mcapSol;
    this.athMcapSol = this.mcapSol;
    this.athAt = ts;
  }
  static fromCreate(ev) {
    const t = new _TokenState(ev.mint, ev.ts);
    t.applyCreate(ev);
    return t;
  }
  applyCreate(ev) {
    this.name = ev.name;
    this.symbol = ev.symbol;
    this.uri = ev.uri;
    this.creator = ev.creator;
    this.createdAt = ev.ts;
    this.createSlot = ev.slot;
    this.createSig = ev.sig;
    this.nonSol = !!ev.nonSolQuote;
    this.partial = false;
    if (ev.vTok > 0) {
      this.vSol = ev.vSol;
      this.vTok = ev.vTok;
      this.realTok = ev.realTok;
      this.supply = ev.supply;
    }
    this.refreshPrice();
    this.firstMcapSol = this.mcapSol;
    this.athMcapSol = Math.max(this.athMcapSol, this.mcapSol);
  }
  get ageMs() {
    return this.lastEventAt - this.createdAt;
  }
  get progress() {
    return this.stage === "curve" ? curveProgress(this) : 1;
  }
  /** lamports of real SOL in the curve (derived from virtual reserves) */
  get realSol() {
    return Math.max(0, this.vSol - CURVE.initialVirtualSol);
  }
  refreshPrice() {
    if (this.stage === "amm" && this.poolBase > 0) {
      const p = { base: this.poolBase, quote: this.poolQuote, supply: this.supply };
      this.mcapSol = poolMcapSol(p);
      this.priceSol = poolPriceSol(p);
    } else {
      this.mcapSol = curveMcapSol(this);
      this.priceSol = curvePriceSol(this);
    }
  }
  bucketFor(ts) {
    const t0 = Math.floor(ts / BUCKET_MS) * BUCKET_MS;
    const b = this.buckets[Math.floor(ts / BUCKET_MS) % BUCKETS];
    if (b.t !== t0) {
      b.t = t0;
      b.buySol = b.sellSol = b.buyN = b.sellN = 0;
      b.close = b.high = b.low = this.mcapSol;
    }
    return b;
  }
  /**
   * Apply a trade. `ctx.fresh` marks wallets never seen before (bundled alts);
   * `ctx.isDev` marks the creator's own trades.
   */
  applyTrade(ev, ctx) {
    const ts = ev.ts;
    this.lastEventAt = Math.max(this.lastEventAt, ts);
    this.lastTradeAt = ts;
    this.tradeCount++;
    if (ev.venue === "amm") {
      if (this.stage !== "amm") {
        this.stage = "amm";
        this.migrateAt ??= ts;
      }
      if (ev.pool) this.pool = ev.pool;
      this.poolBase = ev.vTok;
      this.poolQuote = ev.vSol;
      if (ev.supply && ev.supply > 0) this.supply = ev.supply;
    } else if (this.stage === "curve") {
      this.vSol = ev.vSol;
      this.vTok = ev.vTok;
      if (ev.realTok !== void 0) this.realTok = ev.realTok;
      else this.realTok = Math.max(0, ev.vTok - (CURVE.initialVirtualTok - CURVE.initialRealTok));
      if (ev.supply && ev.supply > 0) this.supply = ev.supply;
    }
    this.refreshPrice();
    const m = this.mcapSol;
    if (this.firstMcapSol === 0) this.firstMcapSol = m;
    if (m > this.athMcapSol) {
      this.athMcapSol = m;
      this.athAt = ts;
    }
    const solAmt = ev.sol / LAMPORTS_PER_SOL;
    const b = this.bucketFor(ts);
    if (ev.buy) {
      this.buyCount++;
      this.buySolTotal += solAmt;
      b.buySol += solAmt;
      b.buyN++;
      if (solAmt > this.maxBuySol) this.maxBuySol = solAmt;
    } else {
      this.sellCount++;
      this.sellSolTotal += solAmt;
      b.sellSol += solAmt;
      b.sellN++;
    }
    b.close = m;
    if (m > b.high) b.high = m;
    if (m < b.low || b.low === 0) b.low = m;
    this.trades.push({ ts, buy: ev.buy, sol: solAmt, user: ev.user, mcap: m });
    this.applyHolder(ev, ctx);
  }
  applyHolder(ev, ctx) {
    const isDev = ev.user === this.creator;
    let h = this.holders.get(ev.user);
    if (!h) {
      if (!ev.buy) {
        if (isDev) this.devSoldTok += ev.tok;
        return;
      }
      this.uniqueBuyers++;
      if (ctx.fresh) this.freshBuys++;
      else if (ctx.knownWallet) this.knownBuys++;
      if (this.holders.size >= MAX_HOLDERS_TRACKED) return;
      const sinceCreate = ev.ts - this.createdAt;
      const bundle = !isDev && !this.partial && (ev.slot !== void 0 && this.createSlot !== void 0 && ev.slot <= this.createSlot || (ev.slot === void 0 || this.createSlot === void 0) && sinceCreate <= 1e3);
      const early = !this.partial && (ev.slot !== void 0 && this.createSlot !== void 0 && ev.slot <= this.createSlot + 2 || (ev.slot === void 0 || this.createSlot === void 0) && sinceCreate <= 3e3);
      h = { bal: 0, maxBal: 0, boughtSol: 0, soldSol: 0, firstBuy: ev.ts, lastBuy: ev.ts, early, bundle, fresh: ctx.fresh };
      this.holders.set(ev.user, h);
      if (bundle) this.bundleBuyers++;
      if (early && !isDev) this.earlyBuyers++;
    }
    const solAmt = ev.sol / LAMPORTS_PER_SOL;
    if (ev.buy) {
      h.bal += ev.tok;
      h.boughtSol += solAmt;
      h.lastBuy = ev.ts;
      if (h.bal > h.maxBal) h.maxBal = h.bal;
      if (h.bundle) this.bundleTok += ev.tok;
      if (h.early && !isDev) this.earlyTok += ev.tok;
      if (isDev) {
        this.devBal += ev.tok;
        this.devBoughtSol += solAmt;
        if (this.devBal > this.devMaxBal) this.devMaxBal = this.devBal;
      }
    } else {
      const sold = Math.min(h.bal, ev.tok);
      h.bal -= sold;
      h.soldSol += solAmt;
      if (h.bundle) this.bundleTok = Math.max(0, this.bundleTok - sold);
      if (h.early && !isDev) this.earlyTok = Math.max(0, this.earlyTok - sold);
      if (isDev) {
        this.devBal = Math.max(0, this.devBal - ev.tok);
        this.devSoldTok += ev.tok;
      }
    }
  }
  applyComplete(ts) {
    if (this.stage === "curve") this.stage = "migrating";
    this.completeAt ??= ts;
    this.realTok = 0;
    this.lastEventAt = Math.max(this.lastEventAt, ts);
  }
  applyMigrate(ts, pool, base, quote) {
    this.stage = "amm";
    this.completeAt ??= ts;
    this.migrateAt ??= ts;
    if (pool) this.pool = pool;
    if (base && quote && base > 0 && quote > 0) {
      this.poolBase = base;
      this.poolQuote = quote;
      this.refreshPrice();
    }
    this.lastEventAt = Math.max(this.lastEventAt, ts);
  }
  applyMeta(ev) {
    const m = this.meta;
    if (ev.twitter) m.twitter = ev.twitter;
    if (ev.telegram) m.telegram = ev.telegram;
    if (ev.website) m.website = ev.website;
    if (ev.description) m.description = ev.description.slice(0, 400);
    if (ev.image) m.image = ev.image;
    if (ev.dexProfile !== void 0) m.dexProfile = ev.dexProfile || m.dexProfile;
    if (ev.boosts !== void 0) m.boosts = Math.max(m.boosts ?? 0, ev.boosts);
    m.fetchedAt = ev.ts;
  }
  applyQuote(ev) {
    this.quote = ev;
    if (!this.name && ev.name) this.name = ev.name;
    if (!this.symbol && ev.symbol) this.symbol = ev.symbol;
    this.lastEventAt = Math.max(this.lastEventAt, ev.ts);
    if (ev.priceSol && ev.priceSol > 0 && this.tradeCount === 0) {
      this.priceSol = ev.priceSol;
      this.mcapSol = ev.priceSol * this.supply / 1e6;
      if (this.firstMcapSol === 0) this.firstMcapSol = this.mcapSol;
      if (this.mcapSol > this.athMcapSol) {
        this.athMcapSol = this.mcapSol;
        this.athAt = ev.ts;
      }
    }
  }
  /** Aggregate flow over the trailing window (ms). */
  window(now, ms, endAgoMs = 0) {
    const from = now - ms - endAgoMs;
    const to = now - endAgoMs;
    let buySol = 0;
    let sellSol = 0;
    let buyN = 0;
    let sellN = 0;
    for (const b of this.buckets) {
      if (b.t < 0 || b.t + BUCKET_MS <= from || b.t > to) continue;
      buySol += b.buySol;
      sellSol += b.sellSol;
      buyN += b.buyN;
      sellN += b.sellN;
    }
    return { buySol, sellSol, buyN, sellN, net: buySol - sellSol, n: buyN + sellN };
  }
  /** Market cap (SOL) as of `agoMs` before `now`, from bucket closes. */
  mcapAgo(now, agoMs) {
    const target = now - agoMs;
    let best;
    for (const b of this.buckets) {
      if (b.t < 0 || b.t > target) continue;
      if (!best || b.t > best.t) best = b;
    }
    if (best) return best.close;
    return target <= this.createdAt ? this.firstMcapSol || this.mcapSol : this.mcapSol;
  }
  /** Unique buyers whose latest buy is within the window. */
  uniqueBuyersSince(since) {
    let n2 = 0;
    for (const h of this.holders.values()) if (h.lastBuy >= since) n2++;
    return n2;
  }
  scanCache = { at: -1, recentMs: 0, withSmart: false, uniqRecent: 0, smart: 0, top10: 0, top1: 0, holders: 0 };
  /**
   * One pass over holders: recent unique buyers, smart holders, top-1/top-10 share of
   * supply (curve/pool excluded) and live holder count. Cached for `maxAgeMs`.
   */
  scanHolders(now, recentMs, isSmart, maxAgeMs = 1e3) {
    const c = this.scanCache;
    if (c.at >= 0 && now - c.at < maxAgeMs && c.recentMs === recentMs && (c.withSmart || !isSmart)) return c;
    const since = now - recentMs;
    let uniq = 0;
    let smart = 0;
    let holders = 0;
    const top = [];
    for (const [addr, h] of this.holders) {
      if (h.lastBuy >= since) uniq++;
      if (h.bal <= 0) continue;
      holders++;
      if (isSmart && isSmart(addr)) smart++;
      if (top.length < 10) {
        top.push(h.bal);
        if (top.length === 10) top.sort((a, b) => a - b);
      } else if (h.bal > top[0]) {
        top[0] = h.bal;
        for (let i = 0; i < 9 && top[i] > top[i + 1]; i++) {
          const tmp = top[i];
          top[i] = top[i + 1];
          top[i + 1] = tmp;
        }
      }
    }
    let sum = 0;
    let max = 0;
    for (const b of top) {
      sum += b;
      if (b > max) max = b;
    }
    this.scanCache = { at: now, recentMs, withSmart: !!isSmart, uniqRecent: uniq, smart, top10: sum / this.supply, top1: max / this.supply, holders };
    return this.scanCache;
  }
  /** Top-1/top-10 holder share of total supply (curve/pool excluded); cached ~2 s. */
  concentration(now) {
    const c = this.scanHolders(now, 6e4, null, 2e3);
    return { at: c.at, top10: c.top10, top1: c.top1, holders: c.holders };
  }
  venue() {
    return this.stage === "amm" ? "amm" : "curve";
  }
  /** True when the token has had no activity for `idleMs`. */
  isIdle(now, idleMs) {
    return now - this.lastEventAt > idleMs;
  }
  toJSON() {
    return {
      mint: this.mint,
      name: this.name,
      symbol: this.symbol,
      creator: this.creator,
      stage: this.stage,
      createdAt: this.createdAt,
      mcapSol: this.mcapSol,
      athMcapSol: this.athMcapSol,
      progress: this.progress,
      trades: this.tradeCount,
      uniqueBuyers: this.uniqueBuyers,
      meta: this.meta
    };
  }
};

// src/core/wallets.ts
var WalletBook = class _WalletBook {
  wallets;
  creators;
  smartSet = /* @__PURE__ */ new Set();
  /** first time the book started observing (for "fresh wallet" confidence) */
  startedAt;
  constructor(now, opts = {}) {
    this.startedAt = now;
    this.wallets = new LRU(opts.maxWallets ?? 8e4);
    this.creators = new LRU(opts.maxCreators ?? 6e4);
  }
  get size() {
    return this.wallets.size;
  }
  peek(addr) {
    return this.wallets.peek(addr);
  }
  /** Records a buy/sell; returns whether the wallet was unknown before this trade. */
  touch(addr, ts, buy) {
    let w = this.wallets.get(addr);
    const known = !!w && w.buys + w.sells > 0;
    if (!w) {
      w = { first: ts, last: ts, buys: 0, sells: 0, tokens: 0, closed: 0, wins: 0, pnl: 0, roiSum: 0, early: 0, bundles: 0, creates: 0 };
      this.wallets.set(addr, w);
    }
    const observedLongEnough = ts - this.startedAt > 45 * 6e4;
    const fresh = observedLongEnough && !known && ts - w.first < 10 * 6e4;
    w.last = ts;
    if (buy) w.buys++;
    else w.sells++;
    return { fresh, known };
  }
  noteNewPosition(addr, early, bundle) {
    const w = this.wallets.peek(addr);
    if (!w) return;
    w.tokens++;
    if (early) w.early++;
    if (bundle) w.bundles++;
  }
  /** Close a wallet's position in a token (sold out, or token evicted). */
  closePosition(addr, boughtSol, soldSol, remainingValueSol) {
    const w = this.wallets.peek(addr);
    if (!w || boughtSol <= 0) return;
    const proceeds = soldSol + Math.max(0, remainingValueSol);
    const pnl = proceeds - boughtSol;
    w.closed++;
    if (pnl > 0) w.wins++;
    w.pnl += pnl;
    w.roiSum += clamp(proceeds / boughtSol - 1, -1, 5);
    if (_WalletBook.isSmart(w)) this.smartSet.add(addr);
    else this.smartSet.delete(addr);
  }
  noteCreate(creator, ts) {
    let c = this.creators.get(creator);
    if (!c) {
      c = { launches: 0, lastLaunch: 0, recent: [], best: 0, graduated: 0 };
      this.creators.set(creator, c);
    }
    c.launches++;
    c.lastLaunch = ts;
    c.recent.push(ts);
    if (c.recent.length > 50) c.recent.splice(0, c.recent.length - 50);
    const w = this.wallets.peek(creator);
    if (w) w.creates++;
  }
  noteCreatorResult(creator, peakMcapSol, graduated) {
    const c = this.creators.peek(creator);
    if (!c) return;
    if (peakMcapSol > c.best) c.best = peakMcapSol;
    if (graduated) c.graduated++;
  }
  creator(creator, now) {
    const c = this.creators.peek(creator);
    if (!c) return { launches24h: 0, launches: 0, best: 0, graduated: 0 };
    let n2 = 0;
    for (const t of c.recent) if (now - t < 864e5) n2++;
    return { launches24h: n2, launches: c.launches, best: c.best, graduated: c.graduated };
  }
  static isSmart(w) {
    if (w.closed < 8) return false;
    if (w.creates > 3) return false;
    const winRate = (w.wins + 1) / (w.closed + 4);
    const avgRoi = w.roiSum / w.closed;
    return winRate >= 0.55 && avgRoi >= 0.3 && w.pnl >= 1;
  }
  isSmart(addr) {
    if (!this.smartSet.has(addr)) return false;
    if (this.wallets.peek(addr)) return true;
    this.smartSet.delete(addr);
    return false;
  }
  smartCount() {
    return this.smartSet.size;
  }
  /** Memory relief: forget the least recently active wallets, keeping ones with a track record. */
  trim(keepFraction) {
    const target = Math.floor(this.wallets.size * clamp(keepFraction, 0, 1));
    const dropped = this.wallets.shrinkTo(target, (a, w) => w.closed >= 3 || w.creates >= 1 || this.smartSet.has(a));
    for (const a of this.smartSet) if (!this.wallets.peek(a)) this.smartSet.delete(a);
    return dropped;
  }
  view(addr, w) {
    const winRate = w.closed ? w.wins / w.closed : 0;
    const avgRoi = w.closed ? w.roiSum / w.closed : 0;
    const tags = [];
    const smart = _WalletBook.isSmart(w);
    if (smart) tags.push("smart");
    if (w.tokens >= 5 && w.early / w.tokens > 0.6) tags.push("sniper");
    if (w.tokens >= 3 && w.bundles / w.tokens > 0.5) tags.push("bundler");
    if (w.creates >= 3) tags.push("serial-dev");
    return { address: addr, ...w, winRate, avgRoi, smart, tags };
  }
  /** Top wallets by realized profit among those with enough closed positions. */
  leaderboard(limit = 50, minClosed = 5) {
    const rows = [];
    for (const [addr, w] of this.wallets.entries()) if (w.closed >= minClosed) rows.push(this.view(addr, w));
    rows.sort((a, b) => b.pnl - a.pnl);
    return rows.slice(0, limit);
  }
  /** Serializable snapshot of wallets worth keeping (enough history). */
  snapshot() {
    const wallets = [];
    for (const [a, w] of this.wallets.entries()) if (w.closed >= 2 || w.creates >= 1) wallets.push([a, w]);
    const creators = [];
    for (const [a, c] of this.creators.entries()) creators.push([a, c]);
    return { wallets, creators };
  }
  restore(snap) {
    for (const [a, w] of snap.wallets ?? []) if (a && w && typeof w.closed === "number") this.wallets.set(a, w);
    for (const [a, c] of snap.creators ?? []) if (a && c && Array.isArray(c.recent)) this.creators.set(a, c);
    this.smartSet.clear();
    for (const [a, w] of this.wallets.entries()) if (_WalletBook.isSmart(w)) this.smartSet.add(a);
  }
};

// src/core/engine.ts
var DEFAULT_CONFIG = {
  maxTokens: 25e3,
  idleEvictMs: 25 * 6e4,
  minTradesToScore: 3,
  rescoreMs: 1e3,
  sweepMs: 5e3,
  feedStaleMs: 45e3,
  feedOutageMs: 6e4,
  paperStartSol: 10,
  outcomeLatencyMs: 1500,
  outcomeSizeSol: 0.1,
  outcomeHorizonMs: 6 * 36e5,
  outcomeMaxOpen: 3e4,
  checkpointsCurveSec: [20, 45, 90, 180, 360, 720],
  checkpointsProgress: [0.25, 0.5, 0.75],
  checkpointsAmmSec: [60, 300, 900, 3600],
  maxSamplesInMemory: 3e4,
  maxWallets: 8e4,
  seed: 1
};
var dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);
var POOL_WAIT_MS = 6e4;
var ENTRY_LEAD_SEC = 600;
function entryFacts(t, f2) {
  const r = (v, d = 4) => Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : 0;
  return {
    mcap: r(t.mcapSol, 2),
    age: Math.round(f2.ageSec),
    buyers: f2.uniqTotal,
    top10: r(f2.top10),
    bundle: r(f2.bundleShare),
    devShare: r(f2.devShare),
    devSold: r(f2.devSold),
    socials: f2.socials,
    launches24h: f2.creatorLaunches24h
  };
}
var Engine = class {
  cfg;
  settings;
  model;
  costs;
  tokens = /* @__PURE__ */ new Map();
  pools = /* @__PURE__ */ new Map();
  wallets;
  narratives = new NarrativeIndex();
  pulse = new MarketPulse();
  funnel = new Funnel();
  outcomes;
  positions = /* @__PURE__ */ new Map();
  closed = new Ring(500);
  tradedMints = /* @__PURE__ */ new Set();
  samples;
  feeds = /* @__PURE__ */ new Map();
  stats;
  paperBalance;
  killed = false;
  /** the autopilot holds new entries (real money, no rule proven at the go-live bar); exits go on */
  autoHold = null;
  executor;
  solUsd = 0;
  log;
  hooks;
  scores = /* @__PURE__ */ new Map();
  dirty = /* @__PURE__ */ new Set();
  orders = /* @__PURE__ */ new Map();
  paperQueue = [];
  /** delayed actions (order retries) so failures never spin in a tight loop */
  later = [];
  lastSweep = 0;
  lastPersist = 0;
  persistDirty = false;
  now = 0;
  rand;
  ammLast = /* @__PURE__ */ new Map();
  ammPending = /* @__PURE__ */ new Map();
  ammPreHits = 0;
  ammPostHits = 0;
  /** population sample of feature vectors (for self-normalizing the prior's scale) */
  xRes = { curve: new Ring(3e3), amm: new Ring(3e3) };
  priorBase;
  lastNormalize = 0;
  constructor(opts) {
    this.cfg = { ...DEFAULT_CONFIG, ...opts.config ?? {} };
    this.settings = sanitizeSettings(opts.settings ?? {}, DEFAULT_SETTINGS);
    this.model = opts.model && validateModel(opts.model) ? opts.model : priorModel(opts.now);
    this.priorBase = priorModel(opts.now);
    this.costs = opts.costs ?? { ...DEFAULT_COSTS, priorityFeeSol: this.settings.priorityFeeSol, platformFeePct: this.settings.platformFeePct };
    this.hooks = opts.hooks ?? {};
    this.log = opts.log ?? silentLogger;
    this.now = opts.now;
    this.rand = rng(this.cfg.seed);
    this.wallets = new WalletBook(opts.now, { maxWallets: this.cfg.maxWallets });
    this.samples = new Ring(this.cfg.maxSamplesInMemory);
    this.paperBalance = this.cfg.paperStartSol * LAMPORTS_PER_SOL;
    this.stats = {
      startedAt: opts.now,
      events: 0,
      trades: 0,
      creates: 0,
      ammSwaps: 0,
      unmappedAmm: 0,
      errors: 0,
      badEvents: 0,
      lastEventAt: 0,
      lastTradeAt: 0,
      realized: 0,
      wins: 0,
      losses: 0,
      entries: 0,
      exits: 0,
      fees: 0,
      dayKey: dayKey(opts.now),
      dayPnl: 0,
      entryTimes: [],
      equity: [{ t: opts.now, v: this.paperBalance }],
      deposits: 0
    };
    this.outcomes = new OutcomeTracker(
      {
        latencyMs: this.cfg.outcomeLatencyMs,
        sizeSol: this.cfg.outcomeSizeSol,
        horizonMs: this.cfg.outcomeHorizonMs,
        maxOpen: this.cfg.outcomeMaxOpen,
        costs: this.costs
      },
      (s) => {
        this.samples.push(s);
        this.hooks.onSample?.(s);
      }
    );
  }
  get clock() {
    return this.now;
  }
  // -------------------------------------------------------------------------
  // Ingestion
  // -------------------------------------------------------------------------
  ingest(ev) {
    try {
      if (!ev || typeof ev !== "object" || typeof ev.k !== "string") {
        this.stats.badEvents++;
        return;
      }
      const ts = Number.isFinite(ev.ts) ? ev.ts : this.now;
      if (ts > this.now) this.advance(ts - 1, true);
      this.stats.events++;
      this.stats.lastEventAt = Math.max(this.stats.lastEventAt, ts);
      switch (ev.k) {
        case "create":
          this.onCreate(ev);
          break;
        case "trade":
          this.onTrade(ev);
          break;
        case "ammSwap":
          this.onAmmSwap(ev);
          break;
        case "complete": {
          const t = this.tokens.get(ev.mint);
          if (t) {
            t.applyComplete(ts);
            this.wallets.noteCreatorResult(t.creator, t.athMcapSol, true);
            this.dirty.add(t.mint);
          }
          break;
        }
        case "migrate": {
          const t = this.tokens.get(ev.mint);
          if (ev.pool) this.pools.set(ev.pool, ev.mint);
          if (t) {
            t.applyMigrate(ts, ev.pool);
            if (!t.poolBase && ev.mintAmount && ev.solAmount) {
              t.poolBase = ev.mintAmount;
              t.poolQuote = ev.solAmount;
              t.refreshPrice();
            }
            this.dirty.add(t.mint);
          }
          if (ev.pool) this.drainPool(ev.pool);
          break;
        }
        case "pool": {
          if (!ev.quoteIsSol) break;
          this.pools.set(ev.pool, ev.mint);
          const t = this.tokens.get(ev.mint);
          if (t) {
            t.applyMigrate(ts, ev.pool, ev.base, ev.quote);
            this.ammLast.set(ev.pool, { base: ev.base, quote: ev.quote, rb: ev.base, rq: ev.quote });
            this.dirty.add(t.mint);
          }
          this.drainPool(ev.pool);
          break;
        }
        case "quote": {
          let t = this.tokens.get(ev.mint);
          if (!t && this.isWatched(ev.mint)) t = this.ensureToken(ev.mint, ts, true);
          if (t) {
            t.applyQuote(ev);
            if (t.tradeCount === 0) this.onPrice(t);
            this.dirty.add(t.mint);
          }
          break;
        }
        case "meta": {
          const t = this.tokens.get(ev.mint);
          if (t) {
            t.applyMeta(ev);
            if (ev.twitter) this.narratives.add(t.mint, t.createdAt, t.name, t.symbol, ev.twitter);
            this.dirty.add(t.mint);
          }
          break;
        }
        default:
          this.stats.badEvents++;
      }
    } catch (e) {
      this.stats.errors++;
      if (this.stats.errors < 20 || this.stats.errors % 1e3 === 0) this.log.error("ingest failed", { err: String(e), k: ev?.k });
    }
  }
  isWatched(mint) {
    for (const p of this.positions.values()) if (p.mint === mint) return true;
    return false;
  }
  ensureToken(mint, ts, partial) {
    let t = this.tokens.get(mint);
    if (!t) {
      t = new TokenState(mint, ts);
      t.partial = partial;
      this.tokens.set(mint, t);
      if (this.tokens.size > this.cfg.maxTokens) this.evictOldest();
    }
    return t;
  }
  onCreate(ev) {
    this.stats.creates++;
    let t = this.tokens.get(ev.mint);
    if (t) t.applyCreate(ev);
    else {
      t = TokenState.fromCreate(ev);
      this.tokens.set(ev.mint, t);
      if (this.tokens.size > this.cfg.maxTokens) this.evictOldest();
    }
    this.wallets.noteCreate(ev.creator, ev.ts);
    this.narratives.add(ev.mint, ev.ts, ev.name, ev.symbol);
    this.pulse.onLaunch(ev.ts);
    if (ev.uri) this.hooks.needMeta?.(ev.mint, ev.uri);
  }
  onTrade(ev) {
    if (!(ev.vSol > 0) || !(ev.vTok > 0) || !(ev.tok >= 0) || !(ev.sol >= 0) || typeof ev.mint !== "string") {
      this.stats.badEvents++;
      return;
    }
    this.stats.trades++;
    this.stats.lastTradeAt = Math.max(this.stats.lastTradeAt, ev.ts);
    if (ev.venue === "amm" && ev.pool) this.stalePools.delete(ev.pool);
    const t = this.ensureToken(ev.mint, ev.ts, true);
    if (t.stage === "amm" && ev.venue === "curve") return;
    const w = this.wallets.touch(ev.user, ev.ts, ev.buy);
    const before = t.holders.get(ev.user);
    const hadBal = before ? before.bal : 0;
    t.applyTrade(ev, { fresh: w.fresh, knownWallet: w.known });
    const after = t.holders.get(ev.user);
    if (!before && after) this.wallets.noteNewPosition(ev.user, after.early, after.bundle);
    if (after && !ev.buy && hadBal > 0 && after.bal <= after.maxBal * 0.02) {
      this.wallets.closePosition(ev.user, after.boughtSol, after.soldSol, 0);
      after.boughtSol = 0;
      after.soldSol = 0;
      after.maxBal = after.bal;
    }
    this.pulse.onTrade(ev.ts, ev.buy, ev.sol / LAMPORTS_PER_SOL);
    this.dirty.add(t.mint);
    this.onPrice(t);
  }
  onAmmSwap(ev) {
    this.stats.ammSwaps++;
    const last = this.ammLast.get(ev.pool);
    if (last) {
      const tol = Math.max(2, last.base * 1e-9);
      if (Math.abs(ev.poolBase - last.base) <= tol) this.ammPreHits++;
      const prevReportedBase = ev.buy ? ev.poolBase + ev.base : ev.poolBase - ev.base;
      if (Math.abs(prevReportedBase - last.rb) <= tol) this.ammPostHits++;
    }
    const pre = this.ammPostHits <= this.ammPreHits || this.ammPreHits + this.ammPostHits < 20;
    const post = ammPostReserves(ev, pre);
    this.ammLast.set(ev.pool, { ...post, rb: ev.poolBase, rq: ev.poolQuote });
    if (this.ammLast.size > 5e4) this.ammLast.delete(this.ammLast.keys().next().value);
    const mint = this.pools.get(ev.pool);
    if (!mint) {
      this.stats.unmappedAmm++;
      let q = this.ammPending.get(ev.pool);
      if (!q) {
        if (this.ammPending.size >= 5e3) return;
        q = [];
        this.ammPending.set(ev.pool, q);
        this.hooks.needPool?.(ev.pool);
      }
      if (q.length < 50) q.push({ ev, post });
      return;
    }
    this.applyAmm(ev, post, mint);
  }
  applyAmm(ev, post, mint) {
    this.onTrade({
      k: "trade",
      ts: ev.ts,
      chainTs: ev.chainTs,
      slot: ev.slot,
      sig: ev.sig,
      src: ev.src,
      mint,
      buy: ev.buy,
      sol: ev.quoteDelta,
      tok: ev.base,
      user: ev.user,
      venue: "amm",
      vSol: post.quote,
      vTok: post.base,
      supply: ev.supply,
      fee: ev.fee,
      pool: ev.pool
    });
  }
  drainPool(pool) {
    const q = this.ammPending.get(pool);
    const mint = this.pools.get(pool);
    if (!q || !mint) return;
    this.ammPending.delete(pool);
    for (const { ev, post } of q) if (this.now - ev.ts < 6e4) this.applyAmm(ev, post, mint);
  }
  /** Register a pool → mint mapping discovered out of band (RPC lookup). */
  mapPool(pool, mint) {
    this.pools.set(pool, mint);
    this.drainPool(pool);
  }
  // -------------------------------------------------------------------------
  // Clock
  // -------------------------------------------------------------------------
  /** Advance engine time: land paper orders, rescore, open checkpoints, maintenance. */
  advance(now, fromIngest = false) {
    try {
      if (now < this.now) now = this.now;
      this.now = now;
      this.landPaperOrders(now);
      if (this.later.length) {
        const due = this.later.filter((a) => a.at <= now);
        if (due.length) {
          this.later = this.later.filter((a) => a.at > now);
          for (const a of due) a.run();
        }
      }
      if (fromIngest) return;
      this.rescoreDirty(now);
      if (now - this.lastSweep >= this.cfg.sweepMs) {
        this.lastSweep = now;
        this.sweep(now);
      }
      if (this.persistDirty && now - this.lastPersist >= 250) this.persistNow();
    } catch (e) {
      this.stats.errors++;
      if (this.stats.errors < 20 || this.stats.errors % 1e3 === 0) this.log.error("advance failed", { err: String(e), stack: e?.stack });
    }
  }
  onPrice(t) {
    const now = Math.max(this.now, t.lastEventAt);
    this.outcomes.onPrice(t, now);
    for (const p of this.positions.values()) if (p.mint === t.mint && (p.status === "open" || p.status === "closing")) this.evaluatePosition(p, t, now);
  }
  // -------------------------------------------------------------------------
  // Scoring and signals
  // -------------------------------------------------------------------------
  scorable(t) {
    if (t.nonSol || t.stage === "migrating") return false;
    if (t.tradeCount < this.cfg.minTradesToScore && !(t.stage === "amm" && t.quote)) return false;
    return true;
  }
  rescoreDirty(now) {
    if (this.dirty.size === 0) return;
    const todo = [];
    for (const mint of this.dirty) {
      const prev = this.scores.get(mint);
      if (prev && now - prev.at < this.cfg.rescoreMs) continue;
      todo.push(mint);
    }
    for (const mint of todo) {
      this.dirty.delete(mint);
      const t = this.tokens.get(mint);
      if (!t || !this.scorable(t)) continue;
      this.scoreOne(t, now);
    }
  }
  scoreOne(t, now) {
    const f2 = extractFeatures(t, { now, wallets: this.wallets, narratives: this.narratives, pulse: this.pulse, mcapOf: (m) => this.tokens.get(m)?.mcapSol ?? 0 });
    const res = scoreToken(this.model, f2, true);
    const x = featureVector(f2);
    let e = this.scores.get(t.mint);
    if (!e) {
      e = { res, f: f2, x, at: now, above: 0, armed: true, lastFunnelAt: 0, reached: 0, held: new Uint8Array(ENTRY_LEVELS.length), cps: [] };
      this.scores.set(t.mint, e);
    } else {
      e.res = res;
      e.f = f2;
      e.x = x;
      e.at = now;
    }
    this.funnel.noteScored(now, t.mint, res.score);
    if (now - e.lastFunnelAt >= 6e4) {
      e.lastFunnelAt = now;
      this.xRes[res.stage].push(x);
    }
    this.checkpoints(t, e, now);
    this.signalLogic(t, e, now);
    return e;
  }
  /**
   * Fixed points in a coin's life (an age, a share of the curve, a time after graduation):
   * each is followed once per coin as a would-be entry, with the facts the filters see, and
   * is the entry itself when the settings trade at that point.
   */
  checkpoints(t, e, now) {
    const custom = { tp: this.settings.tpPct, sl: this.settings.slPct };
    const add = (tag, kind = "checkpoint") => {
      if (e.cps.includes(tag)) return;
      e.cps.push(tag);
      this.outcomes.add(t, kind, tag, now, e.res.score, e.res.p, e.x, custom, entryFacts(t, e.f));
      if (this.settings.entryAt === tag) this.fire(t, e, now, true);
    };
    const own = this.ownMoments();
    if (t.stage === "curve") {
      const age = (now - t.createdAt) / 1e3;
      if (t.partial) return;
      let tag = null;
      for (const s of this.cfg.checkpointsCurveSec) if (age >= s && age < s * 1.6) tag = `age${s}`;
      if (tag) add(tag);
      for (const p of this.cfg.checkpointsProgress) if (t.progress >= p && t.progress < p + 0.1) add(`prog${Math.round(p * 100)}`);
      for (const m of own) if (m.kind === "age" && age >= m.sec && age < m.sec * 1.6) add(m.tag, "moment");
    } else if (t.stage === "amm" && t.migrateAt) {
      const since = (now - t.migrateAt) / 1e3;
      for (const s of this.cfg.checkpointsAmmSec) if (since >= s && since < s * 1.6) add(`mig${s}`);
      for (const m of own) if (m.kind === "mig" && since >= m.sec && since < m.sec * 1.6) add(m.tag, "moment");
    }
  }
  momentsOf = null;
  moments = [];
  /** Moments of your own to record (Settings.moments, and the rule's entry if it is one), parsed once per settings. */
  ownMoments() {
    const s = this.settings;
    if (this.momentsOf !== s) {
      this.momentsOf = s;
      const tags = /* @__PURE__ */ new Set([...s.moments, s.entryAt]);
      this.moments = [...tags].flatMap((tag) => {
        const c = customMoment(tag);
        return c ? [{ tag, ...c }] : [];
      });
    }
    return this.moments;
  }
  /**
   * Follows the first entry at every level the way the bot would have bought it: the score
   * reached the level and held it for the configured number of evaluations.
   */
  entryLevels(t, e, now) {
    if (!this.modelReady()) return;
    const score = e.res.score;
    const need = this.settings.confirmTicks;
    const custom = { tp: this.settings.tpPct, sl: this.settings.slPct };
    for (let i = 0; i < ENTRY_LEVELS.length; i++) {
      const level = ENTRY_LEVELS[i];
      if (score < level) {
        e.held[i] = 0;
        continue;
      }
      if (e.held[i] < 255) e.held[i]++;
      const bit = 1 << i;
      if (e.reached & bit || e.held[i] < need) continue;
      e.reached |= bit;
      this.outcomes.add(t, "entry", `x${level}`, now, score, e.res.p, e.x, custom, entryFacts(t, e.f));
    }
  }
  signalLogic(t, e, now) {
    this.entryLevels(t, e, now);
    const s = this.settings;
    if (s.entryAt !== "score") return;
    const score = e.res.score;
    if (score >= s.minScore) e.above++;
    else {
      e.above = 0;
      if (s.reentry && score < s.minScore - 5) e.armed = true;
    }
    if (!e.armed || e.above < s.confirmTicks) return;
    e.armed = false;
    this.fire(t, e, now, false);
  }
  /** A signal: recorded, checked against every limit and filter, and entered if nothing blocks it. */
  fire(t, e, now, structural) {
    const s = this.settings;
    const score = e.res.score;
    const rec = {
      id: newId("s"),
      ts: now,
      mint: t.mint,
      symbol: t.symbol,
      name: t.name,
      stage: e.res.stage,
      score,
      p: e.res.p,
      mcapSol: t.mcapSol,
      decision: "pending",
      why: e.res.contributions.slice(0, 4)
    };
    const custom = { tp: s.tpPct, sl: s.slPct };
    this.outcomes.add(t, "signal", `sig${Math.floor(now / 1e3)}`, now, score, e.res.p, e.x, custom, entryFacts(t, e.f));
    const blocked = this.entryBlock(t, e, structural);
    if (blocked) {
      rec.decision = "blocked";
      rec.reason = blocked;
      this.funnel.add(rec);
      this.hooks.onSignal?.(rec);
      return;
    }
    this.funnel.add(rec);
    this.enter(t, rec, now);
    this.hooks.onSignal?.(rec);
  }
  /** Account-level limits always apply; token filters only when "score only" is off. */
  entryBlock(t, e, structural = false) {
    const s = this.settings;
    if (!s.enabled) return "bot_off";
    if (this.killed) return "kill_switch";
    if (this.autoHold) return "autopilot_hold";
    if (t.nonSol) return "non_sol_quote";
    if (t.stage === "curve" && !s.tradeCurve || t.stage === "amm" && !s.tradeAmm) return "stage_off";
    if (t.stage === "migrating") return "migrating";
    if (s.conds.length && !condsHold(s.conds, e.x)) return "rule_conditions";
    if (t.stage === "amm" && this.followedPools && !(t.pool && this.followedPools.has(t.pool) && !this.stalePools.has(t.pool))) return "not_followed";
    for (const p of this.positions.values()) if (p.mint === t.mint) return "pending";
    if (!s.reentry && this.tradedMints.has(t.mint)) return "already_traded";
    let open = 0;
    for (const p of this.positions.values()) if (p.status !== "closed" && p.status !== "failed") open++;
    if (open >= s.maxOpen) return "max_open";
    this.rollDay(this.now);
    if (s.maxDailyLossSol > 0 && -this.stats.dayPnl >= s.maxDailyLossSol * LAMPORTS_PER_SOL) return "daily_loss_limit";
    const hourAgo = this.now - 36e5;
    this.stats.entryTimes = this.stats.entryTimes.filter((x) => x > hourAgo);
    if (this.stats.entryTimes.length >= s.maxTradesPerHour) return "rate_limit";
    if (this.feedDown()) return "feed_down";
    if (!structural && !this.modelReady()) return "warming_up";
    if (s.mode === "live") {
      if (!this.executor || !this.executor.ready()) return "live_disabled";
    } else if (this.paperBalance < s.positionSol * LAMPORTS_PER_SOL) return "insufficient_balance";
    if (s.scoreOnly) return null;
    const raw = e.f;
    return filterBlock(s.filters, {
      mcap: t.mcapSol,
      age: raw.ageSec,
      buyers: raw.uniqTotal,
      top10: raw.top10,
      bundle: raw.bundleShare,
      devShare: raw.devShare,
      devSold: raw.devSold,
      socials: raw.socials,
      launches24h: raw.creatorLaunches24h
    });
  }
  /** A prior model trades only after it has been scaled to the live market once. */
  modelReady() {
    return this.model.source === "trained" || !!this.model.scaledAt;
  }
  /** True when the primary trade feed has gone quiet (no trading blind). */
  feedDown() {
    const critical = [...this.feeds.values()].filter((f2) => f2.critical && f2.status !== "off");
    if (critical.length === 0) return false;
    const anyAlive = critical.some((f2) => f2.status === "open" && this.now - f2.lastMsgAt < this.cfg.feedStaleMs);
    return !anyAlive;
  }
  /** The last message from any trade feed the bot relies on. */
  feedLastMsgAt() {
    return Math.max(0, ...[...this.feeds.values()].filter((f2) => f2.critical && f2.status !== "off").map((f2) => f2.lastMsgAt));
  }
  /** Down and silent for `feedOutageMs` or more: an outage, not a reconnect of a few seconds. */
  feedOutage() {
    return this.feedDown() && this.now - this.feedLastMsgAt() >= this.cfg.feedOutageMs;
  }
  setFeedHealth(h) {
    this.feeds.set(h.name, h);
  }
  // -------------------------------------------------------------------------
  // Orders & positions
  // -------------------------------------------------------------------------
  enter(t, rec, now) {
    const s = this.settings;
    const lamports = Math.floor(Math.min(s.positionSol, this.executorCap()) * LAMPORTS_PER_SOL);
    const q = quoteBuy(t, lamports, this.costs, this.solUsd, true);
    if (!q.ok) {
      rec.decision = "failed";
      rec.reason = q.error;
      this.funnel.update(rec.id, "failed", q.error);
      return;
    }
    const pos = {
      id: newId("p"),
      mint: t.mint,
      symbol: t.symbol,
      name: t.name,
      mode: s.mode,
      stageAtEntry: t.stage === "amm" ? "amm" : "curve",
      status: "opening",
      signalId: rec.id,
      signalAt: now,
      signalScore: rec.score,
      signalP: rec.p,
      signalMcapSol: t.mcapSol,
      openedAt: now,
      plan: exitPlanFrom(s),
      rule: ruleKey(s),
      cost: 0,
      tokens: 0,
      tokensLeft: 0,
      entryMcapSol: 0,
      entryPriceSol: 0,
      proceeds: 0,
      value: 0,
      valueAt: now,
      peakValue: 0,
      peakMult: 1,
      lowMult: 1,
      tpHit: false,
      fills: [],
      retries: 0,
      notes: []
    };
    this.positions.set(pos.id, pos);
    this.tradedMints.add(t.mint);
    rec.positionId = pos.id;
    rec.decision = "pending";
    this.stats.entryTimes.push(now);
    const order = {
      id: newId("o"),
      side: "buy",
      mint: t.mint,
      positionId: pos.id,
      amount: lamports,
      slippagePct: s.slippagePct,
      expectedPrice: q.avgPriceSol,
      reason: "signal",
      submittedAt: now,
      attempt: 1
    };
    this.submit(order, pos);
    this.hooks.watchMint?.(t.mint, true);
    this.hooks.onPosition?.(pos, "open");
    this.journal({ type: "entry_submitted", pos: pos.id, mint: t.mint, score: rec.score, lamports, mode: s.mode });
    this.markDirty();
  }
  executorCap() {
    if (this.settings.mode === "live" && this.executor) return this.executor.maxPositionSol();
    return Infinity;
  }
  submit(order, pos) {
    this.orders.set(order.id, order);
    pos.pendingOrder = order.id;
    if (pos.mode === "live") {
      const refuse = !this.executor || order.side === "buy" && !this.executor.ready();
      if (refuse) {
        this.later.push({ at: this.now + 1, run: () => this.onOrderResult({ orderId: order.id, ok: false, error: "live_disabled", ts: this.now, lamports: 0, tokens: 0 }) });
        return;
      }
      try {
        this.executor.submit(order);
      } catch (e) {
        this.later.push({ at: this.now + 1, run: () => this.onOrderResult({ orderId: order.id, ok: false, error: "live_error", ts: this.now, lamports: 0, tokens: 0 }) });
        this.log.error("executor.submit threw", { err: String(e) });
      }
      return;
    }
    const base = this.settings.paperLatencyMs;
    const jitter = base * (0.75 + 0.5 * this.rand());
    order.landAt = order.submittedAt + Math.round(jitter);
    this.paperQueue.push(order);
    this.paperQueue.sort((a, b) => (a.landAt ?? 0) - (b.landAt ?? 0));
  }
  landPaperOrders(now) {
    while (this.paperQueue.length && (this.paperQueue[0].landAt ?? 0) <= now) {
      const o = this.paperQueue.shift();
      this.executePaper(o, o.landAt ?? now);
    }
  }
  /** Simulate an order landing on-chain against the state at landing time. */
  executePaper(o, ts) {
    const t = this.tokens.get(o.mint);
    const fail = (error) => this.onOrderResult({ orderId: o.id, ok: false, error, ts, lamports: 0, tokens: 0 });
    if (!t) return fail("no_price");
    if (o.side === "buy") {
      if (this.paperBalance < o.amount) return fail("insufficient_balance");
      const q = quoteBuy(t, o.amount, this.costs, this.solUsd, true);
      if (!q.ok) return fail(q.error ?? "no_price");
      if (o.expectedPrice > 0 && (q.avgPriceSol / o.expectedPrice - 1) * 100 > o.slippagePct) return fail("slippage");
      this.onOrderResult({ orderId: o.id, ok: true, ts, lamports: q.lamports, tokens: q.tokens, mcapSol: t.mcapSol, fees: q.fees });
    } else {
      const q = quoteSell(t, o.amount, this.costs, this.solUsd, o.closesAccount ?? false);
      if (!q.ok) return fail(q.error ?? "no_price");
      if (o.expectedPrice > 0 && (1 - q.avgPriceSol / o.expectedPrice) * 100 > o.slippagePct) return fail("slippage");
      this.onOrderResult({ orderId: o.id, ok: true, ts, lamports: q.lamports, tokens: o.amount, mcapSol: t.mcapSol, fees: q.fees });
    }
  }
  /** Apply an execution result (paper or live). Idempotent per order id. */
  onOrderResult(r) {
    try {
      const o = this.orders.get(r.orderId);
      if (!o) return;
      this.orders.delete(r.orderId);
      const pos = this.positions.get(o.positionId);
      if (!pos) return;
      if (pos.pendingOrder === o.id) pos.pendingOrder = void 0;
      const t = this.tokens.get(o.mint);
      if (o.side === "buy") this.onBuyResult(pos, o, r, t);
      else this.onSellResult(pos, o, r, t);
      this.markDirty();
    } catch (e) {
      this.stats.errors++;
      this.log.error("onOrderResult failed", { err: String(e) });
    }
  }
  onBuyResult(pos, o, r, t) {
    const rec = this.funnel.get(pos.signalId);
    if (!r.ok) {
      const score = this.scores.get(pos.mint)?.res.score ?? 0;
      const retryable = r.error === "slippage" || r.error === "migrating" || r.error === "no_price" || r.error === "live_error";
      const inWindow = this.now - pos.signalAt <= this.settings.retryWindowSec * 1e3;
      if (retryable && inWindow && score >= this.settings.minScore && t && !this.killed && this.settings.enabled) {
        pos.retries++;
        const lamports = o.amount;
        const q = quoteBuy(t, lamports, this.costs, this.solUsd, true);
        if (q.ok) {
          pos.notes.push(`retry ${pos.retries} after ${r.error}`);
          this.submit({ ...o, id: newId("o"), expectedPrice: q.avgPriceSol, submittedAt: this.now, attempt: o.attempt + 1, landAt: void 0 }, pos);
          return;
        }
      }
      pos.status = "failed";
      pos.exitReason = r.error ?? "failed";
      pos.closedAt = r.ts;
      pos.pnl = 0;
      pos.pnlPct = 0;
      this.positions.delete(pos.id);
      this.closed.push(pos);
      if (!this.settings.reentry) this.tradedMints.delete(pos.mint);
      if (rec) this.funnel.update(rec.id, "failed", r.error);
      this.hooks.watchMint?.(pos.mint, false);
      this.hooks.onPosition?.(pos, "fail");
      this.journal({ type: "entry_failed", pos: pos.id, mint: pos.mint, error: r.error, retries: pos.retries });
      return;
    }
    pos.status = "open";
    pos.cost = r.lamports;
    pos.tokens = r.tokens;
    pos.tokensLeft = r.tokens;
    pos.openedAt = r.ts;
    pos.entryMcapSol = r.mcapSol ?? t?.mcapSol ?? 0;
    pos.entryPriceSol = r.tokens > 0 ? r.lamports / LAMPORTS_PER_SOL / (r.tokens / 1e6) : 0;
    pos.value = r.lamports;
    pos.peakValue = 0;
    const fill = { ts: r.ts, side: "buy", reason: "entry", lamports: r.lamports, tokens: r.tokens, mcapSol: pos.entryMcapSol, priceSol: pos.entryPriceSol, fees: r.fees ?? 0, sig: r.sig };
    pos.fills.push(fill);
    if (pos.mode === "paper") this.paperBalance -= r.lamports;
    this.stats.entries++;
    this.stats.fees += r.fees ?? 0;
    if (rec) this.funnel.update(rec.id, "entered", void 0, pos.id);
    this.hooks.onPosition?.(pos, "fill");
    if (this.killed && t) {
      pos.notes.push("filled after the kill switch \u2014 selling");
      this.sell(pos, t, 1, "kill", r.ts);
    } else if (t) this.evaluatePosition(pos, t, r.ts);
    this.journal({ type: "entry_filled", pos: pos.id, mint: pos.mint, lamports: r.lamports, tokens: r.tokens, mcap: pos.entryMcapSol, sig: r.sig });
  }
  onSellResult(pos, o, r, t) {
    if (!r.ok) {
      pos.retries++;
      const nextSlip = Math.min(95, Math.max(o.slippagePct * 1.6, o.slippagePct + 10));
      pos.notes.push(`exit retry ${pos.retries} after ${r.error}`);
      if (r.error === "migrating" || r.error === "no_price") {
        pos.status = "open";
        return;
      }
      if (pos.retries % 10 === 0) this.log.warn("exit still failing", { pos: pos.id, mint: pos.mint, error: r.error, retries: pos.retries });
      const delay = Math.min(5e3, 500 * o.attempt);
      pos.pendingOrder = "retry";
      this.later.push({
        at: this.now + delay,
        run: () => {
          if (pos.status === "closed" || !this.positions.has(pos.id)) return;
          const tok = this.tokens.get(pos.mint);
          const q = tok ? quoteSell(tok, Math.min(o.amount, pos.tokensLeft), this.costs, this.solUsd, o.closesAccount) : null;
          pos.pendingOrder = void 0;
          this.submit({ ...o, id: newId("o"), amount: Math.min(o.amount, pos.tokensLeft), slippagePct: nextSlip, expectedPrice: q?.ok ? q.avgPriceSol : 0, submittedAt: this.now, attempt: o.attempt + 1, landAt: void 0 }, pos);
        }
      });
      return;
    }
    const sold = Math.min(pos.tokensLeft, r.tokens);
    pos.tokensLeft -= sold;
    pos.proceeds += r.lamports;
    this.stats.fees += r.fees ?? 0;
    if (pos.mode === "paper") this.paperBalance += r.lamports;
    pos.fills.push({ ts: r.ts, side: "sell", reason: o.reason, lamports: r.lamports, tokens: sold, mcapSol: r.mcapSol ?? t?.mcapSol ?? 0, priceSol: sold > 0 ? r.lamports / LAMPORTS_PER_SOL / (sold / 1e6) : 0, fees: r.fees ?? 0, sig: r.sig });
    if (o.reason === "initials") {
      pos.tpHit = true;
      pos.status = "open";
    }
    if (pos.tokensLeft <= 0 || pos.tokensLeft < pos.tokens * 1e-3) this.closePosition(pos, o.reason, r.ts);
    else {
      if (t) {
        const q = quoteSell(t, pos.tokensLeft, this.costs, this.solUsd);
        pos.value = q.ok ? q.lamports : 0;
        pos.peakValue = Math.max(pos.peakValue, pos.value);
      }
      if (pos.status === "closing") pos.status = "open";
      this.hooks.onPosition?.(pos, "update");
    }
    this.journal({ type: "exit_filled", pos: pos.id, mint: pos.mint, reason: o.reason, lamports: r.lamports, tokens: sold, sig: r.sig });
  }
  closePosition(pos, reason, ts) {
    pos.status = "closed";
    pos.tokensLeft = 0;
    pos.value = 0;
    pos.exitReason = reason;
    pos.closedAt = ts;
    pos.pnl = pos.proceeds - pos.cost;
    pos.pnlPct = pos.cost > 0 ? pos.pnl / pos.cost * 100 : 0;
    this.positions.delete(pos.id);
    this.closed.push(pos);
    this.rollDay(ts);
    this.stats.realized += pos.pnl;
    this.stats.dayPnl += pos.pnl;
    this.stats.exits++;
    if (pos.pnl > 0) this.stats.wins++;
    else this.stats.losses++;
    this.stats.equity.push({ t: ts, v: this.paperBalance - this.stats.deposits });
    if (this.stats.equity.length > 2e3) this.stats.equity.splice(0, this.stats.equity.length - 2e3);
    this.hooks.watchMint?.(pos.mint, false);
    this.hooks.onPosition?.(pos, "close");
    this.journal({ type: "closed", pos: pos.id, mint: pos.mint, reason, pnl: pos.pnl, pnlPct: pos.pnlPct, cost: pos.cost, proceeds: pos.proceeds });
  }
  rollDay(ts) {
    const k = dayKey(ts);
    if (k !== this.stats.dayKey) {
      this.stats.dayKey = k;
      this.stats.dayPnl = 0;
    }
  }
  /** Revalue a held position and act on its exit plan. */
  evaluatePosition(pos, t, now) {
    if (pos.status !== "open") return;
    const q = quoteSell(t, pos.tokensLeft, this.costs, this.solUsd, true);
    if (!q.ok) return;
    pos.value = q.lamports;
    pos.valueAt = now;
    const mult = positionMultiple(pos);
    if (mult > pos.peakMult) pos.peakMult = mult;
    if (mult < pos.lowMult) pos.lowMult = mult;
    if (pos.tpHit) pos.peakValue = Math.max(pos.peakValue, pos.value);
    if (pos.pendingOrder) return;
    const d = decideExit(pos, now, t.lastTradeAt || pos.openedAt);
    if (d.action === "arm") {
      pos.tpHit = true;
      pos.peakValue = pos.value;
      pos.notes.push(`target reached at ${mult.toFixed(2)}\xD7, trailing stop armed`);
      this.hooks.onPosition?.(pos, "update");
      return;
    }
    if (d.action === "sell") this.sell(pos, t, d.fraction, d.reason, now);
  }
  sell(pos, t, fraction, reason, now) {
    const tokens = fraction >= 0.999 ? pos.tokensLeft : Math.floor(pos.tokensLeft * fraction);
    if (tokens <= 0) return;
    const full = tokens >= pos.tokensLeft;
    const q = quoteSell(t, tokens, this.costs, this.solUsd, full);
    pos.status = "closing";
    const slip = reason === "sl" || reason === "kill" || reason === "dead" ? Math.max(pos.plan.exitSlippagePct, 40) : pos.plan.exitSlippagePct;
    this.submit(
      {
        id: newId("o"),
        side: "sell",
        mint: pos.mint,
        positionId: pos.id,
        amount: tokens,
        slippagePct: slip,
        expectedPrice: q.ok ? q.avgPriceSol : 0,
        reason,
        submittedAt: now,
        attempt: 1,
        closesAccount: full
      },
      pos
    );
    this.journal({ type: "exit_submitted", pos: pos.id, mint: pos.mint, reason, tokens });
  }
  // -------------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------------
  /**
   * Apply a settings change. `by`: who made it. A rule you pick by hand with the autopilot on
   * leaves it on: your rule then competes with the proven ones (the learner is told, onSettings).
   */
  updateSettings(patch, by = "user") {
    const prev = this.settings;
    const next = sanitizeSettings(patch, prev);
    if (by === "user" && prev.autopilot && next.autopilot && ruleChanged(prev, next)) this.journal({ type: "rule_picked", rule: ruleKey(next) });
    if (!next.autopilot) this.autoHold = null;
    this.settings = next;
    this.costs = { ...this.costs, priorityFeeSol: next.priorityFeeSol, platformFeePct: next.platformFeePct };
    this.outcomes.setOptions({ latencyMs: next.paperLatencyMs, costs: this.costs });
    const moved = next.minScore !== prev.minScore;
    for (const e of this.scores.values()) {
      e.above = 0;
      e.at = 0;
      if (next.reentry) e.armed = true;
      else if (moved) e.armed = e.res.score < next.minScore;
    }
    this.hooks.onSettings?.(next, { by, prev });
    this.journal({ type: "settings", settings: next });
    this.markDirty();
    return next;
  }
  setKill(on, sellAll = false) {
    this.killed = on;
    if (on && sellAll) for (const p of [...this.positions.values()]) this.closeManually(p.id, "kill");
    this.journal({ type: "kill", on, sellAll });
    this.markDirty();
  }
  closeManually(positionId, reason = "manual") {
    const p = this.positions.get(positionId);
    if (!p) return false;
    const t = this.tokens.get(p.mint);
    if (p.status === "opening") {
      p.notes.push("cancelled before fill");
      return false;
    }
    if (!t || p.tokensLeft <= 0 || p.pendingOrder) return false;
    this.sell(p, t, 1, reason, this.now);
    return true;
  }
  /**
   * Live reconciliation after a restart: align a position with what the wallet actually
   * holds (sold elsewhere, partially filled…).
   */
  reconcile(positionId, tokensInWallet) {
    const p = this.positions.get(positionId);
    if (!p) return;
    if (tokensInWallet <= 0) {
      if (p.status === "open" || p.status === "closing") {
        p.proceeds += Math.max(0, p.value);
        p.notes.push("not in wallet after restart \u2014 booked at last marked value (estimate)");
      } else p.notes.push("entry never landed");
      p.tokensLeft = 0;
      this.closePosition(p, "external", this.now);
      return;
    }
    if (p.status === "opening") {
      p.status = "open";
      p.tokens = tokensInWallet;
      p.notes.push("entry confirmed from wallet after restart");
    }
    if (tokensInWallet < p.tokensLeft) {
      p.notes.push(`wallet holds ${tokensInWallet} of ${p.tokensLeft} tokens \u2014 adjusted`);
      p.tokensLeft = tokensInWallet;
    }
    this.markDirty();
  }
  setModel(m) {
    if (!validateModel(m)) return false;
    this.model = m;
    for (const e of this.scores.values()) e.at = 0;
    this.journal({ type: "model", version: m.version, source: m.source });
    return true;
  }
  /**
   * Keep the PRIOR model's scale honest for the market it is watching: learn feature
   * means/spreads from the live population (no outcomes needed) and set the weight
   * temperature so scores spread ~16 points around 50 (≈5% of scored coins reach 75).
   * A trained model keeps the scale its data gave it.
   */
  normalizePrior(minRows = 300) {
    if (this.model.source !== "prior") return;
    let changed = false;
    for (const stage of ["curve", "amm"]) {
      const rows = this.xRes[stage].toArray();
      if (rows.length < minRows) continue;
      const base = this.priorBase.stages[stage];
      const cur = this.model.stages[stage];
      this.model.stages[stage] = { ...cur, ...scalePrior(base, rows), pRef: base.pRef };
      changed = true;
    }
    if (changed) {
      const first = !this.model.scaledAt;
      this.model = { ...this.model, scaledAt: this.now, version: `prior-2.0 \xB7 auto-scaled ${new Date(this.now).toISOString().slice(0, 16)}Z` };
      for (const e of this.scores.values()) {
        e.at = 0;
        if (first) {
          e.armed = true;
          e.above = 0;
        }
      }
      this.hooks.onModel?.(this.model);
      if (first) this.log.info("score scale learned from the live market \u2014 entries enabled");
    }
  }
  // -------------------------------------------------------------------------
  // Maintenance
  // -------------------------------------------------------------------------
  sweep(now) {
    for (const [mint, e] of this.scores) {
      if (now - e.at > 1e4) {
        const t = this.tokens.get(mint);
        if (t && now - t.lastEventAt < 10 * 6e4 && this.scorable(t)) this.scoreOne(t, now);
      }
    }
    for (const p of this.positions.values()) {
      const t = this.tokens.get(p.mint);
      if (t && p.status === "open") this.evaluatePosition(p, t, now);
    }
    if (this.feedOutage()) this.outcomes.blindAll(this.feedLastMsgAt());
    this.outcomes.sweep(now, (m) => this.tokens.get(m));
    const every = this.modelReady() ? 5 * 6e4 : 3e4;
    if (now - this.lastNormalize >= every) {
      this.lastNormalize = now;
      this.normalizePrior(this.modelReady() ? 300 : 150);
    }
    for (const [pool, q] of this.ammPending) if (q.length === 0 || now - q[q.length - 1].ev.ts > 6e4) this.ammPending.delete(pool);
    this.narratives.prune(now);
    this.evictIdle(now);
    this.rollDay(now);
  }
  held(mint) {
    for (const p of this.positions.values()) if (p.mint === mint) return true;
    return false;
  }
  evictIdle(now) {
    for (const [mint, t] of this.tokens) {
      if (!t.isIdle(now, this.cfg.idleEvictMs) || this.held(mint)) continue;
      this.forget(t, now);
    }
    for (const mint of this.scores.keys()) if (!this.tokens.has(mint)) this.scores.delete(mint);
  }
  evictOldest() {
    let oldest;
    for (const t of this.tokens.values()) {
      if (this.held(t.mint)) continue;
      if (!oldest || t.lastEventAt < oldest.lastEventAt) oldest = t;
    }
    if (oldest) this.forget(oldest, this.now);
  }
  forget(t, now) {
    const price = t.priceSol;
    for (const [addr, h] of t.holders) {
      if (h.boughtSol > 0) this.wallets.closePosition(addr, h.boughtSol, h.soldSol, h.bal / 1e6 * price * 0.97);
    }
    this.wallets.noteCreatorResult(t.creator, t.athMcapSol, t.stage !== "curve");
    this.outcomes.onTokenGone(t, now);
    this.tokens.delete(t.mint);
    this.scores.delete(t.mint);
    this.dirty.delete(t.mint);
    if (t.pool) this.pools.delete(t.pool);
  }
  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------
  markDirty() {
    this.persistDirty = true;
  }
  journal(entry) {
    try {
      this.hooks.journal?.({ ts: this.now, ...entry });
    } catch {
    }
  }
  persistNow() {
    this.persistDirty = false;
    this.lastPersist = this.now;
    try {
      this.hooks.persist?.(this.exportState());
      this.saved = { at: this.now, failures: 0, error: "" };
    } catch (e) {
      this.saved = { at: this.saved.at, failures: this.saved.failures + 1, error: String(e?.message ?? e).slice(0, 200) };
      if (this.saved.failures < 5 || this.saved.failures % 100 === 0) this.log.error("persist failed", { err: this.saved.error, inARow: this.saved.failures });
      this.persistDirty = true;
    }
  }
  /** When settings and positions last reached the disk, and failed saves in a row since. */
  saved = { at: 0, failures: 0, error: "" };
  /** PumpSwap pools the stream follows one by one (poolsToFollow); null while every swap reaches us (whole stream, simulator). */
  followedPools = null;
  /** pools followed again after a gap: their price is old until a swap arrives */
  stalePools = /* @__PURE__ */ new Set();
  /**
   * PumpSwap pools whose swaps must reach us: coins we hold first, then coins the rule is about
   * to buy (when it buys at a time after graduating), then graduated coins whose would-be trades
   * are still being followed, newest first, `max` in all. The graduated coins left out stop being
   * observed from now on: their would-be trades are marked (outcomes blindMint), so a stop that
   * nobody saw is not counted as a trade that held its value, and they are not bought (entryBlock
   * "not_followed"): their last price may be long gone. A coin followed again after such a gap
   * is not bought before a swap has brought its price up to date.
   * Called only when pools are followed one by one (not with the whole PumpSwap stream).
   */
  poolsToFollow(max = 40) {
    const out = /* @__PURE__ */ new Set();
    for (const p of this.positions.values()) {
      const pool = this.tokens.get(p.mint)?.pool;
      if (pool) out.add(pool);
    }
    const buyAt = this.ruleBuysAfterGraduating();
    const followed = [];
    for (const mint of this.outcomes.openMints()) {
      const t = this.tokens.get(mint);
      if (t?.stage !== "amm" || t.pool && out.has(t.pool)) continue;
      const since = t.migrateAt ? (this.now - t.migrateAt) / 1e3 : -1;
      const soon = !!buyAt && since >= buyAt.sec - ENTRY_LEAD_SEC && since < buyAt.sec * 1.6 && !this.scores.get(mint)?.cps.includes(buyAt.tag);
      followed.push({ mint, pool: t.pool, at: t.migrateAt ?? 0, soon });
    }
    followed.sort((a, b) => Number(b.soon) - Number(a.soon) || b.at - a.at);
    for (const f2 of followed) {
      if (f2.pool && out.size < max) out.add(f2.pool);
      else if (f2.pool && out.has(f2.pool)) continue;
      else if (!f2.pool && this.now - f2.at < POOL_WAIT_MS) continue;
      else this.outcomes.blindMint(f2.mint, f2.pool || !f2.at ? this.now : f2.at);
    }
    for (const pool of out) {
      if (this.followedPools?.has(pool)) continue;
      const t = this.tokens.get(this.pools.get(pool) ?? "");
      if (t?.migrateAt && this.now - t.migrateAt > POOL_WAIT_MS) this.stalePools.add(pool);
    }
    for (const pool of this.stalePools) if (!out.has(pool)) this.stalePools.delete(pool);
    this.followedPools = out;
    return [...out];
  }
  /** The moment after graduating at which the settings buy (entryAt mig…), if they trade graduated coins that way. */
  ruleBuysAfterGraduating() {
    const m = /^mig(\d+)$/.exec(this.settings.entryAt);
    return m && this.settings.tradeAmm ? { tag: this.settings.entryAt, sec: Number(m[1]) } : null;
  }
  exportState() {
    const heldMints = new Set([...this.positions.values()].map((p) => p.mint));
    const tokens = [];
    for (const m of heldMints) {
      const t = this.tokens.get(m);
      if (!t) continue;
      tokens.push({
        mint: t.mint,
        name: t.name,
        symbol: t.symbol,
        creator: t.creator,
        createdAt: t.createdAt,
        stage: t.stage,
        vSol: t.vSol,
        vTok: t.vTok,
        realTok: t.realTok,
        supply: t.supply,
        pool: t.pool,
        poolBase: t.poolBase,
        poolQuote: t.poolQuote,
        mcapSol: t.mcapSol,
        athMcapSol: t.athMcapSol
      });
    }
    const pools = [];
    for (const [pool, mint] of this.pools) if (heldMints.has(mint)) pools.push([pool, mint]);
    return {
      v: 1,
      savedAt: this.now,
      settings: this.settings,
      positions: [...this.positions.values()],
      closed: this.closed.toArray().slice(-200),
      tradedMints: [...this.tradedMints].slice(-5e3),
      paperBalance: this.paperBalance,
      killed: this.killed,
      stats: this.stats,
      tokens,
      pools
    };
  }
  /** Restore after a restart. Open positions resume exit management immediately. */
  restore(s) {
    if (!s || s.v !== 1) return;
    this.settings = sanitizeSettings(s.settings ?? {}, DEFAULT_SETTINGS);
    if (s.settings && typeof s.settings === "object" && !("autopilot" in s.settings) && this.settings.mode === "live") this.settings.autopilot = false;
    this.costs = { ...this.costs, priorityFeeSol: this.settings.priorityFeeSol, platformFeePct: this.settings.platformFeePct };
    this.paperBalance = Number.isFinite(s.paperBalance) ? s.paperBalance : this.paperBalance;
    this.killed = !!s.killed;
    for (const m of s.tradedMints ?? []) this.tradedMints.add(m);
    for (const p of s.closed ?? []) this.closed.push(p);
    if (s.stats) this.stats = { ...this.stats, ...s.stats, startedAt: this.stats.startedAt, lastEventAt: 0, lastTradeAt: 0 };
    for (const [pool, mint] of s.pools ?? []) this.pools.set(pool, mint);
    for (const pt of s.tokens ?? []) {
      const t = new TokenState(pt.mint, pt.createdAt);
      t.name = pt.name;
      t.symbol = pt.symbol;
      t.creator = pt.creator;
      t.stage = pt.stage;
      t.vSol = pt.vSol;
      t.vTok = pt.vTok;
      t.realTok = pt.realTok;
      t.supply = pt.supply;
      t.pool = pt.pool;
      t.poolBase = pt.poolBase;
      t.poolQuote = pt.poolQuote;
      t.partial = true;
      t.refreshPrice();
      t.athMcapSol = Math.max(pt.athMcapSol, t.mcapSol);
      t.lastEventAt = this.now;
      this.tokens.set(t.mint, t);
    }
    for (const p of s.positions ?? []) {
      if (p.status === "opening") {
        if (p.mode === "paper") {
          p.status = "failed";
          p.exitReason = "restart_before_fill";
          p.closedAt = this.now;
          this.closed.push(p);
          continue;
        }
      }
      if (p.status === "closing") p.status = "open";
      p.pendingOrder = void 0;
      this.positions.set(p.id, p);
      this.hooks.watchMint?.(p.mint, true);
    }
    this.log.info("state restored", { open: this.positions.size, closed: this.closed.length });
  }
  // -------------------------------------------------------------------------
  // Views (dashboard)
  // -------------------------------------------------------------------------
  scoreOf(mint) {
    return this.scores.get(mint);
  }
  radar(opts = {}) {
    const limit = clamp(opts.limit ?? 60, 1, 500);
    const rows = [];
    const held = new Set([...this.positions.values()].map((p) => p.mint));
    for (const [mint, e] of this.scores) {
      const t = this.tokens.get(mint);
      if (!t) continue;
      if (opts.stage && opts.stage !== "all" && e.res.stage !== opts.stage) continue;
      if (opts.minScore && e.res.score < opts.minScore) continue;
      rows.push(this.radarRow(t, e, held.has(mint)));
    }
    const sort = opts.sort ?? "score";
    rows.sort((a, b) => sort === "new" ? b.createdAt - a.createdAt : sort === "mcap" ? b.mcapSol - a.mcapSol : b.score - a.score);
    return rows.slice(0, limit);
  }
  radarRow(t, e, held) {
    const f2 = e.f;
    const flags = [];
    if (f2.bundleShare > 0.15) flags.push("bundled");
    if (f2.devSold > 0.5) flags.push("dev sold");
    if (f2.creatorLaunches24h > 3) flags.push("serial dev");
    if (f2.smartBuyers > 0) flags.push(`${f2.smartBuyers} smart`);
    if (f2.top10 > 0.5) flags.push("concentrated");
    if (f2.isLeader) flags.push("narrative leader");
    else if (f2.clusterSize > 1) flags.push("copycat");
    return {
      mint: t.mint,
      name: t.name,
      symbol: t.symbol,
      stage: e.res.stage,
      score: Math.round(e.res.score * 10) / 10,
      p: e.res.p,
      calibrated: e.res.calibrated,
      mcapSol: t.mcapSol,
      athMcapSol: t.athMcapSol,
      ageSec: f2.ageSec,
      progress: t.progress,
      net60: f2.net60,
      buyers: f2.uniqTotal,
      holders: f2.holders,
      top10: f2.top10,
      devShare: f2.devShare,
      cluster: f2.clusterSize,
      flags,
      held,
      spent: !e.armed,
      createdAt: t.createdAt,
      lastTradeAt: t.lastTradeAt,
      image: t.meta.image,
      twitter: t.meta.twitter,
      telegram: t.meta.telegram,
      website: t.meta.website,
      why: e.res.contributions.slice(0, 3)
    };
  }
  tokenDetail(mint) {
    const t = this.tokens.get(mint);
    if (!t) return null;
    const e = this.scores.get(mint);
    const conc = t.concentration(this.now);
    const narrative = this.narratives.describe(mint, (m) => this.tokens.get(m)?.mcapSol ?? 0);
    const holders = [...t.holders.entries()].filter(([, h]) => h.bal > 0).sort((a, b) => b[1].bal - a[1].bal).slice(0, 15).map(([addr, h]) => ({
      addr,
      pct: h.bal / t.supply * 100,
      dev: addr === t.creator,
      early: h.early,
      bundle: h.bundle,
      smart: this.wallets.isSmart(addr)
    }));
    return {
      mint,
      name: t.name,
      symbol: t.symbol,
      creator: t.creator,
      stage: t.stage,
      createdAt: t.createdAt,
      partial: t.partial,
      mcapSol: t.mcapSol,
      athMcapSol: t.athMcapSol,
      progress: t.progress,
      pool: t.pool,
      meta: t.meta,
      quote: t.quote,
      score: e?.res ?? null,
      features: e?.f ?? null,
      concentration: conc,
      narrative,
      holders,
      creatorStats: t.creator ? this.wallets.creator(t.creator, this.now) : null,
      trades: t.trades.toArray().slice(-60).reverse(),
      positions: [...this.positions.values(), ...this.closed.toArray()].filter((p) => p.mint === mint),
      // the coin's entry moment: whether it came, and what the bot did about it
      entry: {
        spent: e ? !e.armed : false,
        above: e?.above ?? 0,
        need: this.settings.confirmTicks,
        signals: this.funnel.recent.toArray().filter((r) => r.mint === mint)
      }
    };
  }
  health() {
    const now = this.now;
    const mem = typeof process !== "undefined" && process.memoryUsage ? process.memoryUsage().rss : 0;
    return {
      now,
      uptimeSec: Math.round((now - this.stats.startedAt) / 1e3),
      feeds: [...this.feeds.values()],
      feedDown: this.feedDown(),
      saved: this.saved,
      tokens: this.tokens.size,
      scored: this.scores.size,
      wallets: this.wallets.size,
      smartWallets: this.wallets.smartCount(),
      pools: this.pools.size,
      events: this.stats.events,
      trades: this.stats.trades,
      creates: this.stats.creates,
      ammSwaps: this.stats.ammSwaps,
      unmappedAmm: this.stats.unmappedAmm,
      errors: this.stats.errors,
      badEvents: this.stats.badEvents,
      lagMs: this.stats.lastEventAt ? Math.max(0, now - this.stats.lastEventAt) : null,
      hypotheticalsOpen: this.outcomes.open,
      samples: this.samples.length,
      samplesResolved: this.outcomes.resolvedCount,
      ammReserveConvention: this.ammPreHits + this.ammPostHits < 20 ? "learning" : this.ammPreHits >= this.ammPostHits ? "pre-trade" : "post-trade",
      memMb: mem ? Math.round(mem / 1e6) : null,
      model: { version: this.model.version, source: this.model.source, training: this.model.training ?? null }
    };
  }
  /**
   * Adds paper money (the paper balance ran low). History stays; the amount is booked as a
   * deposit, so results and win rates are unchanged and it never shows up as profit.
   */
  addPaperMoney(sol2) {
    const lamports = Math.round(sol2 * LAMPORTS_PER_SOL);
    if (!(lamports > 0)) return this.paperBalance;
    this.paperBalance += lamports;
    this.stats.deposits += lamports;
    this.journal({ type: "paper_deposit", sol: sol2, balance: this.paperBalance });
    this.markDirty();
    return this.paperBalance;
  }
  account() {
    const open = [...this.positions.values()];
    const openValue = open.reduce((s, p) => s + p.value, 0);
    const exposure = open.reduce((s, p) => s + p.cost - p.proceeds, 0);
    return {
      mode: this.settings.mode,
      enabled: this.settings.enabled,
      killed: this.killed,
      paperBalance: this.paperBalance,
      equity: this.paperBalance + openValue,
      openValue,
      exposure,
      realized: this.stats.realized,
      deposits: this.stats.deposits,
      dayPnl: this.stats.dayPnl,
      wins: this.stats.wins,
      losses: this.stats.losses,
      entries: this.stats.entries,
      fees: this.stats.fees,
      open,
      closed: this.closed.toArray().slice(-100).reverse(),
      equityCurve: this.stats.equity
    };
  }
};

// src/core/edges.ts
var HOLDS_MIN = [0, 10, 30, 60];
var EXITS = GRID.length * HOLDS_MIN.length;
var f = (s) => s.f;
var CONDITIONS = [
  { key: "any", label: "any coin", test: () => true },
  { key: "curve", label: "still on the bonding curve", test: (s) => s.stage === "curve", stage: "curve" },
  { key: "amm", label: "already graduated", test: (s) => s.stage === "amm", stage: "amm" },
  ...[40, 80, 150].map((v) => ({ key: `mcap<=${v}`, label: `market cap \u2264 ${v} SOL`, test: (s) => f(s).mcap <= v, filters: { maxMcapSol: v } })),
  ...[80, 150, 300].map((v) => ({ key: `mcap>=${v}`, label: `market cap \u2265 ${v} SOL`, test: (s) => f(s).mcap >= v, filters: { minMcapSol: v } })),
  ...[1, 3, 10].map((m) => ({ key: `age<=${m}m`, label: `younger than ${m} min`, test: (s) => f(s).age <= m * 60, filters: { maxAgeMin: m } })),
  ...[3, 10].map((m) => ({ key: `age>=${m}m`, label: `older than ${m} min`, test: (s) => f(s).age >= m * 60, filters: { minAgeSec: m * 60 } })),
  { key: "bundle<=10", label: "\u2264 10% bundled at launch", test: (s) => f(s).bundle * 100 <= 10, filters: { maxBundlePct: 10 } },
  { key: "top10<=30", label: "top 10 holders own \u2264 30%", test: (s) => f(s).top10 * 100 <= 30, filters: { maxTop10Pct: 30 } },
  ...[30, 100].map((n2) => ({ key: `buyers>=${n2}`, label: `${n2}+ buyers`, test: (s) => f(s).buyers >= n2, filters: { minBuyers: n2 } })),
  { key: "socials", label: "has socials", test: (s) => f(s).socials > 0, filters: { requireSocials: true } },
  { key: "dev<=5", label: "dev holds \u2264 5%", test: (s) => f(s).devShare * 100 <= 5, filters: { maxDevPct: 5 } },
  { key: "devheld", label: "dev hasn't sold", test: (s) => f(s).devSold <= 0, filters: { maxDevSoldPct: 0 } },
  { key: "onelaunch", label: "dev's only launch today", test: (s) => f(s).launches24h <= 1, filters: { maxDevLaunches24h: 1 } }
];
var OPEN_FILTERS = {
  minMcapSol: 0,
  maxMcapSol: 0,
  maxDevPct: 100,
  maxTop10Pct: 100,
  maxBundlePct: 100,
  minBuyers: 0,
  minAgeSec: 0,
  maxAgeMin: 0,
  requireSocials: false,
  maxDevLaunches24h: 0,
  maxDevSoldPct: 100
};
var EDGE_METHOD = 3;
var DEFAULTS = {
  horizonMs: 6 * 36e5,
  minHours: 24,
  minSamples: 1e3,
  minDiscovery: 80,
  minHoldout: 40,
  candidates: 20,
  minWins: 10,
  placeboRuns: 3,
  seed: 7
};
function exitReturn(s, c, h) {
  return exitReturnAt(s, c, HOLDS_MIN[h]);
}
function exitReturnAt(s, c, hold) {
  const ret = s.grid[c];
  const window = hold ? hold * 60 : Infinity;
  const t = s.gridT?.[c];
  if (hold === 0 || (t ?? 0) <= hold * 60) return counts(s, t ?? Infinity, window) ? ret : NaN;
  if (!counts(s, window, window)) return NaN;
  const v = s.path?.[PATH_MIN.indexOf(hold)];
  return v ?? ret;
}
function describe(r) {
  const cond = CONDITIONS.find((c) => c.key === r.cond);
  const when = r.cond === "any" ? "" : ` \xB7 ${cond.label}`;
  const time = r.hold ? `, or after ${r.hold} min` : "";
  const entry = r.at ? `Buy every coin ${entryLabel(r.at)}` : `Buy when a coin first reaches ${r.level}`;
  return `${entry}${when} \xB7 sell at +${r.tp}% or \u2212${r.sl}%${time}`;
}
function edgeRuleFromText(text) {
  const m = /^Buy (?:every coin (.+?)|when a coin first reaches (\d+))(?: · (.+?))? · sell at \+(\d+)% or −(\d+)%(?:, or after (\d+) min)?$/.exec(text.trim());
  if (!m) return null;
  const at2 = m[1] !== void 0 ? tagOfLabel(m[1]) : void 0;
  if (m[1] !== void 0 && !at2) return null;
  const level = m[2] !== void 0 ? Number(m[2]) : 0;
  if (m[2] !== void 0 && !ENTRY_LEVELS.includes(level)) return null;
  const cond = m[3] === void 0 ? CONDITIONS[0] : CONDITIONS.find((c) => c.label === m[3]);
  const tp = Number(m[4]);
  const sl = Number(m[5]);
  const hold = m[6] === void 0 ? 0 : Number(m[6]);
  if (!cond || !GRID.some((g) => g.tp === tp && g.sl === sl) || !HOLDS_MIN.includes(hold)) return null;
  const rule = { level, cond: cond.key, tp, sl, hold };
  if (at2) rule.at = at2;
  return describe(rule) === text.trim() ? rule : null;
}
function settingsFor(r, horizonMs) {
  const cond = CONDITIONS.find((c) => c.key === r.cond);
  const out = {
    entryAt: r.at ?? "score",
    conds: [],
    minScore: r.at ? 0 : r.level,
    tpPct: r.tp,
    slPct: r.sl,
    maxHoldMin: r.hold || Math.round(horizonMs / 6e4),
    trailPct: 0,
    takeInitials: false,
    reentry: false,
    tradeCurve: cond.stage !== "amm",
    tradeAmm: cond.stage !== "curve",
    scoreOnly: !cond.filters
  };
  if (cond.filters) out.filters = { ...OPEN_FILTERS, ...cond.filters };
  return out;
}
function recordedRows(samples, horizonMs) {
  let lastResolved = 0;
  for (const s of samples) if (s.resolvedAt > lastResolved) lastResolved = s.resolvedAt;
  const cutoff = lastResolved - horizonMs;
  return samples.filter(
    (s) => (s.kind === "entry" || s.kind === "checkpoint" && s.tag in ENTRY_POINTS || s.kind === "moment" && customMoment(s.tag) !== null) && s.gv === GRID_VERSION && s.f && s.gridT?.length === GRID.length && s.path?.length === PATH_MIN.length && s.ts <= cutoff
  ).sort((a, b) => a.ts - b.ts);
}
function whyUnmeasurable(s, horizonMs) {
  if (s.entryAt === "score" && !ENTRY_LEVELS.includes(s.minScore)) return `score ${s.minScore} is not one of the levels the bot records (${ENTRY_LEVELS.join(", ")})`;
  if (s.entryAt === "score" && s.reentry) return "buying the same coin again is not recorded";
  if (!GRID.some((g) => g.tp === s.tpPct && g.sl === s.slPct))
    return `+${s.tpPct}% / \u2212${s.slPct}% is not among the exits the bot records (take profit ${GRID_TP_TEXT}; stop loss ${GRID_SL_TEXT})`;
  if (holdOf(s, horizonMs) === null) return `a time limit of ${s.maxHoldMin} min is not among the ones the bot records (${PATH_MIN.join(", ")} min, ${Math.round(horizonMs / 36e5)} h or none)`;
  if (s.trailPct > 0) return "a trailing stop is not recorded";
  if (s.takeInitials) return "taking the initials out is not recorded";
  return null;
}
var GRID_TP_TEXT = [...new Set(GRID.map((g) => g.tp))].map((x) => `${x}%`).join(", ");
var GRID_SL_TEXT = [...new Set(GRID.map((g) => g.sl))].map((x) => `${x}%`).join(", ");
function holdOf(s, horizonMs) {
  if (s.maxHoldMin === 0 || s.maxHoldMin * 6e4 >= horizonMs) return 0;
  return PATH_MIN.includes(s.maxHoldMin) ? s.maxHoldMin : null;
}
function measureRule(rows, s, o) {
  const key = ruleKey(s);
  const none = (why) => ({ key, ok: false, why, n: 0, mean: NaN, lo: NaN, hi: NaN, coinsPerDay: 0 });
  const bad2 = whyUnmeasurable(s, o.horizonMs);
  if (bad2) return none(bad2);
  const tag = s.entryAt === "score" ? `x${s.minScore}` : s.entryAt;
  const family = rows.filter((r) => r.tag === tag);
  if (family.length < 2) return none(`the bot has no finished recordings of ${s.entryAt === "score" ? `coins reaching ${s.minScore}` : `coins ${entryLabel(tag)}`} yet`);
  const f0 = family[0].ts;
  const f1 = family[family.length - 1].ts;
  const split = f0 + (f1 - f0) * 2 / 3;
  const combo = GRID.findIndex((g) => g.tp === s.tpPct && g.sl === s.slPct);
  const hold = holdOf(s, o.horizonMs);
  const t0 = rows[0].ts;
  const vals = [];
  const hours = [];
  const mints = /* @__PURE__ */ new Set();
  let held = 0;
  let wins2 = 0;
  let qualified = 0;
  for (const r of family) {
    if (r.ts < split) continue;
    if (r.stage === "curve" && !s.tradeCurve || r.stage === "amm" && !s.tradeAmm) continue;
    if (s.conds.length && !condsHold(s.conds, r.x)) continue;
    if (!s.scoreOnly && filterBlock(s.filters, r.f)) continue;
    qualified++;
    mints.add(r.mint);
    const v = exitReturnAt(r, combo, hold);
    if (Number.isNaN(v)) continue;
    vals.push(v);
    hours.push(Math.floor((r.ts - t0) / 36e5));
    if (v > 0) wins2++;
    const sec = r.gridT?.[combo] ?? 0;
    held += hold ? Math.min(sec, hold * 60) : sec;
  }
  const minN = o.minN ?? DEFAULTS.minHoldout;
  const minWins = o.minWins ?? DEFAULTS.minWins;
  if (vals.length < minN)
    return none(
      qualified >= minN ? `only ${vals.length} of the ${qualified} coins that qualified on the newest recordings were watched through its whole time limit (${minN} needed) \u2014 graduated coins drop out of the 40 followed pools after a while` : `only ${qualified} coins qualified for it on the newest recordings (${minN} needed)`
    );
  const m = clusteredMeanCI(vals, hours, 1 - 0.1 / Math.max(1, o.tests ?? DEFAULTS.candidates));
  const days = Math.max(1 / 24, (f1 - split) / 864e5);
  const out = { key, ok: true, n: vals.length, mean: m.mean, lo: m.lo, hi: m.hi, coinsPerDay: mints.size / days, avgHoldMin: held / vals.length / 60 };
  if (wins2 < minWins) return { ...out, ok: false, why: `only ${wins2} of its ${vals.length} coins won \u2014 too few to count on` };
  return out;
}
function forwardTest(rows, rule, after) {
  const tag = rule.at ?? `x${rule.level}`;
  const cond = CONDITIONS.find((c) => c.key === rule.cond);
  const combo = GRID.findIndex((g) => g.tp === rule.tp && g.sl === rule.sl);
  const h = HOLDS_MIN.indexOf(rule.hold);
  if (!cond || combo < 0 || h < 0) return void 0;
  const v = [];
  const hours = [];
  for (const s of rows) {
    if (s.ts <= after || s.tag !== tag || !cond.test(s)) continue;
    const x = exitReturn(s, combo, h);
    if (Number.isNaN(x)) continue;
    v.push(x);
    hours.push(hourOf(s.ts));
  }
  const m = clusteredMeanCI(v, hours);
  return { text: describe(rule), n: v.length, mean: m.mean, lo: m.lo, hi: m.hi };
}
function stats(d, idx, e, z) {
  let n2 = 0;
  let sum = 0;
  let sq = 0;
  let w = 0;
  for (let k = 0; k < idx.length; k++) {
    const v = d.R[d.row(idx[k]) * EXITS + e] - d.shift[e];
    if (Number.isNaN(v)) continue;
    n2++;
    sum += v;
    sq += v * v;
    if (d.wins(v)) w++;
  }
  if (n2 < 2) return { n: n2, mean: n2 ? sum : NaN, lo: -Infinity, winRate: n2 ? w / n2 : NaN };
  const mean2 = sum / n2;
  const variance = Math.max(0, (sq - n2 * mean2 * mean2) / (n2 - 1));
  return { n: n2, mean: mean2, lo: mean2 - z * Math.sqrt(variance / n2), winRate: w / n2 };
}
function holdoutStats(d, idx, e, tests) {
  const st = stats(d, idx, e, 0);
  if (st.n < 2) return st;
  const vals = [];
  const hours = [];
  for (let k = 0; k < idx.length; k++) {
    const v = d.R[d.row(idx[k]) * EXITS + e] - d.shift[e];
    if (Number.isNaN(v)) continue;
    vals.push(v);
    hours.push(d.hour[idx[k]]);
  }
  return { ...st, lo: clusteredMeanCI(vals, hours, 1 - 0.1 / Math.max(1, tests)).lo };
}
var wins = (st) => Math.round(st.winRate * st.n);
function* search(d, groups, o) {
  let tested = 0;
  const best = [];
  for (const g of groups) {
    if (g.disc.length < o.minDiscovery) continue;
    let top = null;
    for (let e = 0; e < EXITS; e++) {
      tested++;
      const st = stats(d, g.disc, e, 2);
      if (wins(st) < o.minWins) continue;
      if (!top || st.lo > top.disc.lo) top = { g, e, disc: st };
    }
    if (top && top.disc.mean > 0 && top.disc.lo > 0) best.push(top);
    yield;
  }
  best.sort((a, b) => b.disc.lo - a.disc.lo);
  const cands = best.slice(0, o.candidates);
  const checked = cands.map((c) => ({ c, hold: holdoutStats(d, c.g.hold, c.e, cands.length) }));
  const passed = checked.filter((x) => x.hold.n >= o.minHoldout && wins(x.hold) >= o.minWins && x.hold.lo > 0);
  return { tested, cands: checked, passed };
}
async function findEdgesAsync(samples, opts = {}) {
  const it = steps(samples, opts);
  let t = Date.now();
  for (; ; ) {
    const r = it.next();
    if (r.done) return r.value;
    if (Date.now() - t > 15) {
      await new Promise((res) => setTimeout(res, 0));
      t = Date.now();
    }
  }
}
function* steps(samples, opts) {
  const o = { ...DEFAULTS, ...opts };
  const now = opts.now ?? Date.now();
  const base = {
    generatedAt: now,
    method: EDGE_METHOD,
    status: "not_enough_data",
    note: "",
    samples: 0,
    hours: 0,
    discoveryHours: 0,
    holdoutHours: 0,
    tested: 0,
    candidates: 0,
    survivors: [],
    failed: [],
    placebo: { runs: 0, avgSurvivors: 0, maxSurvivors: 0 }
  };
  const rows = recordedRows(samples, o.horizonMs);
  if (rows.length) base.cutoff = rows[rows.length - 1].ts;
  if (opts.incumbent) base.incumbent = forwardTest(rows, opts.incumbent.rule, opts.incumbent.after);
  const own = (tests) => opts.own ? { own: measureRule(rows, opts.own, { horizonMs: o.horizonMs, tests, minN: o.minHoldout, minWins: o.minWins }) } : {};
  const n2 = rows.length;
  const t0 = n2 ? rows[0].ts : 0;
  const t1 = n2 ? rows[n2 - 1].ts : 0;
  const hours = n2 ? (t1 - t0) / 36e5 : 0;
  base.samples = n2;
  base.hours = hours;
  if (n2 < o.minSamples || hours < o.minHours) {
    base.note = `Needs at least ${o.minHours} hours of recorded market and ${o.minSamples.toLocaleString("en-US")} finished would-be trades (so far: ${hours.toFixed(1)} h, ${n2.toLocaleString("en-US")}). Each outcome finishes ${Math.round(o.horizonMs / 36e5)} hours after its entry.`;
    return { ...base, ...own(o.candidates) };
  }
  const R = new Float32Array(n2 * EXITS);
  for (let i = 0; i < n2; i++) {
    const s = rows[i];
    for (let c = 0; c < GRID.length; c++) for (let h = 0; h < HOLDS_MIN.length; h++) R[i * EXITS + c * HOLDS_MIN.length + h] = exitReturn(s, c, h);
    if (i % 2e3 === 0) yield;
  }
  const groups = [];
  const byEntry = /* @__PURE__ */ new Map();
  rows.forEach((s, i) => {
    let list = byEntry.get(s.tag);
    if (!list) byEntry.set(s.tag, list = []);
    list.push(i);
  });
  const yours = [...new Set(rows.filter((s) => s.kind === "moment").map((s) => s.tag))].sort();
  const families = [
    ...ENTRY_LEVELS.map((level) => ({ tag: `x${level}`, level })),
    ...[...Object.keys(ENTRY_POINTS), ...yours].map((at2) => ({ tag: at2, level: 0, at: at2 }))
  ];
  for (const fam of families) {
    const idx = byEntry.get(fam.tag) ?? [];
    if (!idx.length) continue;
    const f0 = rows[idx[0]].ts;
    const f1 = rows[idx[idx.length - 1]].ts;
    const split = f0 + (f1 - f0) * 2 / 3;
    const holdDays = Math.max(1 / 24, (f1 - split) / 864e5);
    CONDITIONS.forEach((cond, ci) => {
      const disc = [];
      const hold = [];
      for (const i of idx) if (cond.test(rows[i])) (rows[i].ts < split ? disc : hold).push(i);
      groups.push({ level: fam.level, at: fam.at, cond: ci, disc: Int32Array.from(disc), hold: Int32Array.from(hold), holdDays });
    });
  }
  const hour2 = new Int32Array(n2);
  for (let i = 0; i < n2; i++) hour2[i] = Math.floor((rows[i].ts - t0) / 36e5);
  const zero = new Float64Array(EXITS);
  const real = { R, row: (i) => i, shift: zero, wins: (v) => v > 0, hour: hour2 };
  const run = yield* search(real, groups, o);
  const toFound = (c, holdSt) => {
    const combo = Math.floor(c.e / HOLDS_MIN.length);
    const rule = { level: c.g.level, cond: CONDITIONS[c.g.cond].key, tp: GRID[combo].tp, sl: GRID[combo].sl, hold: HOLDS_MIN[c.e % HOLDS_MIN.length] };
    if (c.g.at) rule.at = c.g.at;
    const all = groups.find((g) => g.level === c.g.level && g.at === c.g.at && g.cond === 0);
    let held = 0;
    let heldN = 0;
    for (const i of c.g.hold) {
      if (Number.isNaN(R[i * EXITS + c.e])) continue;
      const sec = rows[i].gridT?.[combo] ?? 0;
      held += rule.hold ? Math.min(sec, rule.hold * 60) : sec;
      heldN++;
    }
    return {
      ...rule,
      text: describe(rule),
      discovery: c.disc,
      holdout: holdSt,
      baseline: stats(real, all.hold, c.e, 0).mean,
      tradesPerDay: new Set(Array.from(c.g.hold, (i) => rows[i].mint)).size / c.g.holdDays,
      avgHoldMin: heldN ? held / heldN / 60 : void 0,
      settings: settingsFor(rule, o.horizonMs)
    };
  };
  const survivors = run.passed.map((x) => toFound(x.c, x.hold)).sort((a, b) => b.holdout.lo - a.holdout.lo);
  const failed = run.cands.filter((x) => !run.passed.includes(x)).slice(0, 3).map((x) => toFound(x.c, x.hold));
  const colMean = new Float64Array(EXITS);
  const colN = new Float64Array(EXITS);
  for (let i = 0; i < n2; i++)
    for (let e = 0; e < EXITS; e++) {
      const v = R[i * EXITS + e];
      if (Number.isNaN(v)) continue;
      colMean[e] += v;
      colN[e]++;
    }
  for (let e = 0; e < EXITS; e++) colMean[e] = colN[e] ? colMean[e] / colN[e] : 0;
  const rand = rng(o.seed);
  const counts2 = [];
  for (let r = 0; r < o.placeboRuns; r++) {
    const perm = new Int32Array(n2);
    for (let i = 0; i < n2; i++) perm[i] = i;
    for (let i = n2 - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = perm[i];
      perm[i] = perm[j];
      perm[j] = t;
    }
    counts2.push((yield* search({ R, row: (i) => perm[i], shift: colMean, wins: (v) => v > 0, hour: hour2 }, groups, o)).passed.length);
  }
  const discHours = hours * (2 / 3);
  return {
    ...base,
    ...own(run.cands.length),
    status: "ok",
    note: survivors.length ? `${survivors.length} rule${survivors.length > 1 ? "s" : ""} held up on the newest data the search never saw.` : "No rule held up on the newest data yet. That is a real answer: keep recording, the search runs again every few hours.",
    discoveryHours: discHours,
    holdoutHours: hours - discHours,
    tested: run.tested,
    candidates: run.cands.length,
    survivors,
    failed,
    placebo: {
      runs: counts2.length,
      avgSurvivors: counts2.length ? counts2.reduce((a, b) => a + b, 0) / counts2.length : 0,
      maxSurvivors: counts2.length ? Math.max(...counts2) : 0
    }
  };
}

// src/core/lab.ts
var DAY = 864e5;
var NF = FEATURE_KEYS.length;
var H = HOLDS_MIN.length;
var LAB = {
  /** ideas from the search tested at once */
  maxActive: 20,
  /** your own ideas tested at once */
  mineMax: 5,
  /** new ideas from one search at most, one per entry */
  newPerRun: 3,
  /** finished coins at which an idea is looked at; it can be proven only at these */
  looks: [60, 120, 240, 480],
  /** one-sided error per look: an idea without an edge passes a look by luck at most this often */
  alpha: 5e-4,
  /** a proof resting on a handful of lucky wins is not trusted */
  minWins: 10,
  /** an idea not proven after this long leaves */
  maxAgeMs: 7 * DAY,
  /** a proven idea leaves after this long, and has to be found and proven again */
  provenMs: 14 * DAY,
  /** coins after its proof before a proven idea can be dropped for falling short */
  postMin: 40,
  /** the search: fewest trades a rule needs on the data it is invented from */
  minSeen: 60,
  /** the search needs this much finished data */
  minHours: 24,
  minRows: 1e3,
  /** candidate thresholds: these shares of each fact's values at each entry */
  quantiles: [0.1, 0.25, 0.5, 0.75, 0.9],
  /** thresholds per entry that get every exit after the first look (on SCREEN exits) */
  screenTop: 16,
  /** single conditions per entry carried into pairs */
  pairTop: 8,
  /** a failed idea is not suggested again for this long */
  retryAfterMs: 3 * DAY,
  /** retired ideas kept to show */
  keepRetired: 30,
  /** results kept per idea (oldest dropped beyond) */
  keepVals: 3e3
};
var LAB_METHOD = 1;
var sig2 = (v) => v === 0 || !Number.isFinite(v) ? 0 : Number(v.toPrecision(2));
var signedPct = (x) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
var pctFact = (key, label) => ({ key, label, raw: (x) => x, x: (r) => r, nice: (r) => Math.round(r * 100) / 100, show: (r) => `${Math.round(r * 100)}%`, pct: true });
var countFact = (key, label) => ({ key, label, raw: Math.expm1, x: (r) => Math.log1p(Math.max(0, r)), nice: (r) => r >= 10 ? sig2(r) : Math.round(r), show: (r) => `${Math.round(r)}` });
var solFact = (key, label) => ({ key, label, raw: Math.sinh, x: Math.asinh, nice: sig2, show: (r) => `${r} SOL` });
var moveFact = (key, label) => ({ key, label, raw: (x) => Math.exp(x) - 1, x: (r) => Math.max(-2, Math.min(2, Math.log(1 + Math.max(-0.99, r)))), nice: (r) => Math.round(r * 100) / 100, show: signedPct, pct: true });
var yesNoFact = (key, label) => ({ key, label, raw: (x) => x, x: (r) => r, nice: (r) => r >= 0.5 ? 1 : 0, show: (r) => r >= 0.5 ? "yes" : "no", yesNo: true });
var LAB_FACTS = [
  { key: "age", label: "Age", raw: Math.expm1, x: (r) => Math.log1p(Math.max(0, r)), nice: (r) => r < 90 ? Math.round(r / 5) * 5 : r < 5400 ? Math.round(r / 60) * 60 : Math.round(r / 600) * 600, show: fmtAge },
  { key: "mcap", label: "Market cap", raw: Math.exp, x: (r) => Math.log(Math.max(r, 1)), nice: sig2, show: (r) => `${r} SOL` },
  pctFact("progress", "Curve progress"),
  solFact("net60", "Net inflow 60s"),
  solFact("net300", "Net inflow 5m"),
  { key: "accel", label: "Acceleration", raw: (x) => x, x: (r) => r, nice: (r) => Math.round(r * 10) / 10, show: (r) => r.toFixed(1) },
  pctFact("buyRatio", "Buy share 60s"),
  countFact("uniq60", "New buyers 60s"),
  countFact("uniqTotal", "Buyers total"),
  countFact("trades60", "Trades 60s"),
  { key: "avgBuy", label: "Avg buy 5m", raw: (x) => Math.exp(x) - 0.01, x: (r) => Math.log(0.01 + Math.max(0, r)), nice: sig2, show: (r) => `${r} SOL` },
  pctFact("whale", "Largest buy share"),
  pctFact("devShare", "Dev holds"),
  pctFact("devSold", "Dev sold"),
  pctFact("bundle", "Bundled supply"),
  pctFact("early", "Sniper supply"),
  pctFact("top10", "Top 10 holders"),
  countFact("holders", "Holders"),
  pctFact("drawdown", "Below peak"),
  moveFact("chg30", "Move 30s"),
  moveFact("chg120", "Move 2m"),
  countFact("smart", "Smart wallets in"),
  pctFact("fresh", "Fresh wallets"),
  { key: "socials", label: "Socials", raw: (x) => x * 3, x: (r) => r / 3, nice: (r) => Math.round(r), show: (r) => `${Math.round(r)} of 3` },
  yesNoFact("tweet", "Tweet-linked"),
  { key: "cluster", label: "Narrative heat", raw: Math.exp, x: (r) => Math.log(Math.max(1, r)), nice: (r) => Math.round(r), show: (r) => `${Math.round(r)} similar coins` },
  yesNoFact("leader", "Narrative leader"),
  yesNoFact("copycat", "Copycat"),
  { key: "serial", label: "Dev launches in 24 h", raw: (x) => Math.expm1(x) + 1, x: (r) => Math.log1p(Math.max(0, r - 1)), nice: (r) => Math.round(r), show: (r) => `${Math.round(r)}` },
  { key: "creatorBest", label: "Dev's best coin", raw: (x) => Math.expm1(x) * 100, x: (r) => Math.log1p(Math.max(0, r) / 100), nice: sig2, show: (r) => `${r} SOL` },
  { key: "heat", label: "Market heat", raw: (x) => x, x: (r) => r, nice: (r) => Math.round(r * 100) / 100, show: (r) => r.toFixed(2) },
  { key: "liquidity", label: "Liquidity", raw: Math.expm1, x: (r) => Math.log1p(Math.max(0, r)), nice: sig2, show: (r) => `${r} SOL` },
  { key: "dex", label: "DEX listing paid", raw: (x) => x, x: (r) => r, nice: (r) => Math.round(r), show: (r) => `${Math.round(r)} of 2` }
];
var FACT = new Map(LAB_FACTS.map((f2) => [f2.key, f2]));
var FACT_INDEX = LAB_FACTS.map((f2) => FEATURE_KEYS.indexOf(f2.key));
function describeCond(c) {
  const f2 = FACT.get(c.k);
  if (!f2) return c.k;
  const raw = f2.raw(c.v);
  if (f2.yesNo) return c.op === ">=" ? f2.label.toLowerCase() : `not ${f2.label.toLowerCase()}`;
  return `${f2.label.toLowerCase()} ${c.op === ">=" ? "\u2265" : "\u2264"} ${f2.show(raw)}`;
}
function condCode(c) {
  const f2 = FACT.get(c.k);
  if (!f2) return `${c.k}${c.op}${c.v}`;
  const raw = f2.raw(c.v);
  if (f2.yesNo) return `${c.k}=${c.op === ">=" ? 1 : 0}`;
  return `${c.k}${c.op}${f2.pct ? `${Math.round(raw * 100)}%` : String(Number(raw.toPrecision(4)))}`;
}
function entryWords(at2) {
  return at2.startsWith("x") ? `Buy when a coin first reaches ${at2.slice(1)}` : `Buy every coin ${entryLabel(at2)}`;
}
function describeLab(r) {
  const where = [r.stage === "curve" ? "still on the bonding curve" : r.stage === "amm" ? "already graduated" : "", ...r.conds.map(describeCond)].filter(Boolean);
  const time = r.hold ? `, or after ${r.hold} min` : "";
  return `Lab: ${entryWords(r.at)}${where.length ? ` with ${where.join(" and ")}` : ""} \xB7 sell at +${r.tp}% or \u2212${r.sl}%${time}`;
}
function labCode(r) {
  const entry = r.at.startsWith("x") ? `score${r.at.slice(1)}` : r.at;
  return [entry, r.stage ? `stage=${r.stage}` : "", ...r.conds.map(condCode), `tp${r.tp}`, `sl${r.sl}`, r.hold ? `hold${r.hold}` : ""].filter(Boolean).join(" ");
}
var GRID_TPS = [...new Set(GRID.map((g) => g.tp))];
var GRID_SLS = [...new Set(GRID.map((g) => g.sl))];
var LAB_FORMAT = `entry, then up to 3 conditions, then the exit \u2014 e.g. "mig300 top10<=25% smart>=1 tp100 sl30 hold30". Entry: score50\u2026score95 (the first time the score reaches it) or ${Object.keys(ENTRY_POINTS).join(", ")}. Optional: stage=curve or stage=amm. Conditions on: ${LAB_FACTS.map((f2) => f2.key).join(", ")} (with >= or <=; % for shares; =1 / =0 for yes/no). Take profit tp: ${GRID_TPS.join(", ")}; stop loss sl: ${GRID_SLS.join(", ")}; time limit hold (minutes): ${HOLDS_MIN.filter((h) => h > 0).join(", ")}, or none.`;
function parseLabRule(text) {
  const words = text.trim().replace(/≥/g, ">=").replace(/≤/g, "<=").split(/\s+/).filter(Boolean);
  if (!words.length) return { error: `Write a rule: ${LAB_FORMAT}` };
  let at2 = "";
  const first = words[0].toLowerCase();
  const score = /^(?:score|x)(\d+)$/.exec(first);
  if (score && ENTRY_LEVELS.includes(Number(score[1]))) at2 = `x${score[1]}`;
  else if (first in ENTRY_POINTS) at2 = first;
  else return { error: `"${words[0]}" is not an entry. Start with score50\u2026score95 or one of: ${Object.keys(ENTRY_POINTS).join(", ")}.` };
  const rule = { at: at2, conds: [], tp: NaN, sl: NaN, hold: 0 };
  for (const w of words.slice(1)) {
    const lw = w.toLowerCase();
    let m;
    if (m = /^stage=(curve|amm)$/.exec(lw)) rule.stage = m[1];
    else if (m = /^tp(\d+)%?$/.exec(lw)) rule.tp = Number(m[1]);
    else if (m = /^sl(\d+)%?$/.exec(lw)) rule.sl = Number(m[1]);
    else if (m = /^hold(\d+)(?:m|min)?$/.exec(lw)) rule.hold = Number(m[1]);
    else if (m = /^([a-z0-9]+)(>=|<=|=|>|<)(-?\d+(?:\.\d+)?)(%?)$/i.exec(w)) {
      const f2 = LAB_FACTS.find((x) => x.key.toLowerCase() === m[1].toLowerCase());
      if (!f2) return { error: `"${m[1]}" is not a fact the bot records. Use one of: ${LAB_FACTS.map((x) => x.key).join(", ")}.` };
      let raw = Number(m[3]);
      if (f2.pct && (m[4] === "%" || Math.abs(raw) > 1)) raw /= 100;
      let op;
      if (f2.yesNo) {
        if (m[2] !== "=" || raw !== 0 && raw !== 1) return { error: `${f2.key} is yes/no: write ${f2.key}=1 or ${f2.key}=0.` };
        op = raw === 1 ? ">=" : "<=";
      } else if (m[2] === "=") return { error: `Use >= or <= with ${f2.key}.` };
      else op = m[2].startsWith(">") ? ">=" : "<=";
      rule.conds.push({ k: f2.key, op, v: f2.x(raw) });
    } else return { error: `Could not read "${w}". ${LAB_FORMAT}` };
  }
  if (rule.conds.length > 3) return { error: "At most 3 conditions." };
  if (!Number.isFinite(rule.tp) || !Number.isFinite(rule.sl)) return { error: `Give the exit: tp (one of ${GRID_TPS.join(", ")}) and sl (one of ${GRID_SLS.join(", ")}).` };
  if (!GRID.some((g) => g.tp === rule.tp && g.sl === rule.sl)) return { error: `The bot records take profit ${GRID_TPS.join(", ")} and stop loss ${GRID_SLS.join(", ")} only.` };
  if (!HOLDS_MIN.includes(rule.hold)) return { error: `Time limit: hold${HOLDS_MIN.filter((h) => h > 0).join(", hold")}, or leave it out.` };
  if (rule.at.startsWith("mig") && rule.stage === "curve") return { error: "A coin is bought after graduating there, so it cannot still be on the curve." };
  return { rule };
}
function labSettings(r, horizonMs) {
  const score = r.at.startsWith("x");
  return {
    entryAt: score ? "score" : r.at,
    conds: r.conds.map((c) => ({ ...c })),
    minScore: score ? Number(r.at.slice(1)) : 0,
    tpPct: r.tp,
    slPct: r.sl,
    maxHoldMin: r.hold || Math.round(horizonMs / 6e4),
    trailPct: 0,
    takeInitials: false,
    reentry: false,
    tradeCurve: r.stage !== "amm",
    tradeAmm: r.stage !== "curve",
    scoreOnly: true
  };
}
function emptyLab() {
  return { v: 1, method: LAB_METHOD, ranAt: 0, seenTo: 0, horizonMs: 6 * 36e5, tested: 0, note: "The Lab starts once a day of market is recorded.", ideas: [], leads: [], entries: [] };
}
function copyLab(st) {
  return {
    ...st,
    leads: st.leads.map((x) => ({ ...x })),
    entries: st.entries.map((x) => ({ ...x })),
    ideas: st.ideas.map((i) => ({ ...i, conds: i.conds.map((c) => ({ ...c })), vals: [...i.vals], hrs: [...i.hrs], post: { vals: [...i.post.vals], hrs: [...i.post.hrs] } }))
  };
}
function restoreLab(saved) {
  const s = saved;
  if (!s || s.v !== 1 || s.method !== LAB_METHOD || !Array.isArray(s.ideas)) return emptyLab();
  return copyLab({ ...emptyLab(), ...s, ideas: s.ideas.filter((i) => i && Array.isArray(i.vals) && Array.isArray(i.conds) && i.post) });
}
var shapeOf = (r) => `${r.at}|${r.stage ?? ""}|${r.conds.map((c) => c.k + c.op).sort().join(",")}|${r.tp}|${r.sl}|${r.hold}`;
var exitOf = (r) => GRID.findIndex((g) => g.tp === r.tp && g.sl === r.sl) * H + HOLDS_MIN.indexOf(r.hold);
function statsOf(vals, hrs, level) {
  if (vals.length < 2) return { n: vals.length, mean: vals.length ? vals[0] : NaN, lo: -Infinity, hi: Infinity };
  const m = clusteredMeanCI(vals, hrs, level);
  return { n: vals.length, mean: m.mean, lo: m.lo, hi: m.hi };
}
var STRICT = 1 - 2 * LAB.alpha;
var r42 = (v) => Math.round(v * 1e4) / 1e4;
function newIdea(rule, source, now, from, seen) {
  return {
    id: newId("lab"),
    ...rule,
    conds: rule.conds.map((c) => ({ ...c })),
    text: describeLab(rule),
    code: labCode(rule),
    source,
    born: now,
    from,
    ...seen ? { seen } : {},
    status: "testing",
    coins: 0,
    vals: [],
    hrs: [],
    heldSec: 0,
    looked: 0,
    post: { vals: [], hrs: [] }
  };
}
function addLabIdea(st, text, now = Date.now()) {
  const p = parseLabRule(text);
  if ("error" in p) return { ok: false, error: p.error };
  const next = copyLab(st);
  const code = labCode(p.rule);
  if (next.ideas.some((i) => i.status !== "retired" && i.code === code)) return { ok: false, error: "This rule is already being tested." };
  if (next.ideas.filter((i) => i.source === "you" && i.status === "testing").length >= LAB.mineMax) return { ok: false, error: `At most ${LAB.mineMax} of your ideas are tested at once \u2014 wait for one to finish.` };
  const idea = newIdea(p.rule, "you", now, now);
  next.ideas.push(idea);
  return { ok: true, idea, state: next };
}
function retire(i, now, why) {
  i.last = statsOf(i.vals, i.hrs, 0.95);
  i.status = "retired";
  i.retiredAt = now;
  i.why = why;
  i.vals = [];
  i.hrs = [];
  i.post = { vals: [], hrs: [] };
}
var pct1 = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
function judge(st, now) {
  const proven = [];
  for (const i of st.ideas) {
    if (i.status === "testing") {
      const n2 = i.vals.length;
      const reached = LAB.looks.filter((k) => n2 >= k).length;
      if (reached > i.looked) {
        i.looked = reached;
        const strict = statsOf(i.vals, i.hrs, STRICT);
        const wins2 = i.vals.filter((v) => v > 0).length;
        const ci = statsOf(i.vals, i.hrs, 0.95);
        if (strict.lo > 0 && wins2 >= LAB.minWins) {
          Object.assign(i, { status: "proven", provenAt: now, provenTo: st.seenTo, proof: strict });
          proven.push(i);
          continue;
        }
        if (ci.hi < 0) {
          retire(i, now, `losing: ${pct1(ci.mean)} per trade on ${n2} coins after it was invented (at best ${pct1(ci.hi)})`);
          continue;
        }
        if (reached === LAB.looks.length) {
          retire(i, now, `not proven on ${n2} coins after it was invented (${pct1(ci.mean)} per trade, range ${pct1(ci.lo)} to ${pct1(ci.hi)})`);
          continue;
        }
      }
      if (now - i.born > LAB.maxAgeMs) retire(i, now, `too few coins to judge in a week (${n2} of ${LAB.looks[0]})`);
    } else if (i.status === "proven") {
      const post = statsOf(i.post.vals, i.post.hrs, 0.95);
      if (i.proof && post.n >= LAB.postMin && post.hi < i.proof.lo) {
        retire(i, now, `stopped working: ${pct1(post.mean)} per trade on ${post.n} coins after its proof, below the ${pct1(i.proof.lo)} worst case it had shown`);
        i.stopped = true;
      } else if (now - (i.provenAt ?? now) > LAB.provenMs) retire(i, now, "proven two weeks ago: the search has to find and prove it again on newer data");
    }
  }
  const retired = st.ideas.filter((i) => i.status === "retired").sort((a, b) => (b.retiredAt ?? 0) - (a.retiredAt ?? 0));
  const drop = new Set(retired.slice(LAB.keepRetired).map((i) => i.id));
  if (drop.size) st.ideas = st.ideas.filter((i) => !drop.has(i.id));
  return { proven };
}
var SCREEN = [
  [25, 10, 0],
  [50, 20, 0],
  [50, 20, 10],
  [100, 30, 0],
  [100, 30, 30],
  [100, 50, 0],
  [200, 50, 0],
  [150, 40, 60],
  [300, 70, 0],
  [500, 50, 0]
].map(([tp, sl, hold]) => GRID.findIndex((g) => g.tp === tp && g.sl === sl) * H + HOLDS_MIN.indexOf(hold)).filter((e) => e >= 0);
var Totals = class {
  t = new Float64Array(4 * EXITS);
  add(R, row) {
    const base = row * EXITS;
    const t = this.t;
    for (let e = 0; e < EXITS; e++) {
      const v = R[base + e];
      if (v !== v) continue;
      t[e]++;
      t[EXITS + e] += v;
      t[2 * EXITS + e] += v * v;
      if (v > 0) t[3 * EXITS + e]++;
    }
  }
};
function bestBetween(b, a) {
  let best = null;
  for (let e = 0; e < EXITS; e++) {
    const n2 = b[e] - (a ? a[e] : 0);
    if (n2 < LAB.minSeen || b[3 * EXITS + e] - (a ? a[3 * EXITS + e] : 0) < LAB.minWins) continue;
    const mean2 = (b[EXITS + e] - (a ? a[EXITS + e] : 0)) / n2;
    const sq = b[2 * EXITS + e] - (a ? a[2 * EXITS + e] : 0);
    const lo = mean2 - 2 * Math.sqrt(Math.max(0, (sq - n2 * mean2 * mean2) / (n2 - 1)) / n2);
    if (!best || lo > best.lo) best = { e, n: n2, mean: mean2, lo };
  }
  return best;
}
function bestExit(d, rows) {
  const tot = new Totals();
  for (let k = 0; k < rows.length; k++) tot.add(d.R, rows[k]);
  return bestBetween(tot.t, null);
}
function heldBothHalves(d, rows, e, mid) {
  const half = [0, 0];
  const cnt = [0, 0];
  for (const i of rows) {
    const v = d.R[i * EXITS + e];
    if (v !== v) continue;
    const k = d.rows[i].ts < mid ? 0 : 1;
    half[k] += v;
    cnt[k]++;
  }
  return cnt[0] >= LAB.minSeen / 3 && cnt[1] >= LAB.minSeen / 3 && half[0] > 0 && half[1] > 0;
}
function lowerBound(a, v) {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const m = lo + hi >> 1;
    if (a[m] < v) lo = m + 1;
    else hi = m;
  }
  return lo;
}
function* searchEntry(d, at2, idx) {
  const m = idx.length;
  const singles = [];
  const screened = [];
  let tested = 0;
  if (at2.startsWith("x"))
    for (const stage of ["curve", "amm"]) {
      const rows = idx.filter((i) => d.rows[i].stage === stage);
      if (rows.length < LAB.minSeen || rows.length > m - LAB.minSeen / 2) continue;
      tested += EXITS;
      const b = bestExit(d, rows);
      if (b) singles.push({ at: at2, stage, conds: [], ...b, rows });
    }
  for (let fi = 0; fi < LAB_FACTS.length; fi++) {
    const fact = LAB_FACTS[fi];
    const col = FACT_INDEX[fi];
    if (col < 0) continue;
    const vals = new Float64Array(m);
    for (let p = 0; p < m; p++) vals[p] = d.X[idx[p] * NF + col];
    const order = Int32Array.from({ length: m }, (_, p) => p).sort((a, b) => vals[a] - vals[b]);
    const sorted = Float64Array.from(order, (p) => vals[p]);
    const masks = [];
    const seenT = /* @__PURE__ */ new Set();
    for (const q of LAB.quantiles) {
      const t2 = fact.x(fact.nice(fact.raw(sorted[Math.floor(q * (m - 1))])));
      if (!Number.isFinite(t2) || seenT.has(t2)) continue;
      seenT.add(t2);
      const ge = lowerBound(sorted, t2 - 1e-9);
      const le = lowerBound(sorted, t2 + 1e-9);
      for (const mk of [
        { op: ">=", v: t2, a: ge, b: m },
        { op: "<=", v: t2, a: 0, b: le }
      ])
        if (mk.b - mk.a >= LAB.minSeen && mk.b - mk.a <= m - LAB.minSeen / 2) masks.push(mk);
    }
    if (!masks.length) continue;
    const cuts = /* @__PURE__ */ new Set();
    for (const mk of masks) cuts.add(mk.a).add(mk.b);
    const snap = /* @__PURE__ */ new Map();
    const E = SCREEN.length;
    const t = new Float64Array(4 * E);
    for (let p = 0; p <= m; p++) {
      if (cuts.has(p)) snap.set(p, t.slice());
      if (p === m) break;
      const base = idx[order[p]] * EXITS;
      for (let j = 0; j < E; j++) {
        const v = d.R[base + SCREEN[j]];
        if (v !== v) continue;
        t[j]++;
        t[E + j] += v;
        t[2 * E + j] += v * v;
        if (v > 0) t[3 * E + j]++;
      }
    }
    tested += masks.length * E;
    for (const mk of masks) {
      const b = snap.get(mk.b);
      const a = snap.get(mk.a);
      let score = -Infinity;
      for (let j = 0; j < E; j++) {
        const n2 = b[j] - a[j];
        if (n2 < LAB.minSeen || b[3 * E + j] - a[3 * E + j] < LAB.minWins) continue;
        const mean2 = (b[E + j] - a[E + j]) / n2;
        const lo = mean2 - 2 * Math.sqrt(Math.max(0, (b[2 * E + j] - a[2 * E + j] - n2 * mean2 * mean2) / (n2 - 1)) / n2);
        if (lo > score) score = lo;
      }
      if (score > -Infinity) screened.push({ fact, mk, score, rows: Int32Array.from(order.subarray(mk.a, mk.b), (p) => idx[p]) });
    }
    yield;
  }
  screened.sort((a, b) => b.score - a.score);
  for (const c of screened.slice(0, LAB.screenTop)) {
    tested += EXITS;
    const b = bestExit(d, c.rows);
    if (b) singles.push({ at: at2, conds: [{ k: c.fact.key, op: c.mk.op, v: c.mk.v }], ...b, rows: c.rows });
  }
  yield;
  singles.sort((a, b) => b.lo - a.lo);
  const top = singles.filter((s) => s.mean > 0).slice(0, LAB.pairTop);
  const pairs = [];
  const mark = new Uint8Array(d.rows.length);
  for (let i = 0; i < top.length; i++) {
    for (const r of top[i].rows) mark[r] = 1;
    for (let j = i + 1; j < top.length; j++) {
      const A = top[i];
      const B = top[j];
      if (A.stage && B.stage || A.conds[0] && B.conds[0] && A.conds[0].k === B.conds[0].k) continue;
      const rows = B.rows.filter((r) => mark[r] === 1);
      if (rows.length < LAB.minSeen) continue;
      tested += EXITS;
      const b = bestExit(d, rows);
      if (b) pairs.push({ at: at2, stage: A.stage ?? B.stage, conds: [...A.conds, ...B.conds], ...b, rows });
    }
    for (const r of top[i].rows) mark[r] = 0;
    yield;
  }
  const mid = d.rows[idx[Math.floor(m / 2)]].ts;
  const found = [...singles, ...pairs].filter((f2) => f2.lo > 0 && f2.mean > 0 && heldBothHalves(d, f2.rows, f2.e, mid)).sort((a, b) => b.lo - a.lo);
  return { found: found.slice(0, 5), singles: singles.slice(0, 3), tested };
}
function usable(s, cutoff) {
  return (s.kind === "entry" || s.kind === "checkpoint" && s.tag in ENTRY_POINTS) && s.gv === GRID_VERSION && s.x?.length === NF && s.gridT?.length === GRID.length && s.path?.length === PATH_MIN.length && s.ts <= cutoff;
}
function matches(i, s) {
  return s.tag === i.at && (!i.stage || s.stage === i.stage) && condsHold(i.conds, s.x);
}
function* labSteps(samples, prev, opts) {
  const now = opts.now ?? Date.now();
  const st = copyLab(prev.method === LAB_METHOD ? prev : emptyLab());
  st.horizonMs = opts.horizonMs ?? st.horizonMs;
  let lastResolved = 0;
  for (const s of samples) if (s.resolvedAt > lastResolved) lastResolved = s.resolvedAt;
  const cutoff = lastResolved - st.horizonMs;
  const rows = samples.filter((s) => usable(s, cutoff)).sort((a, b) => a.ts - b.ts);
  const n2 = rows.length;
  const X = new Float32Array(n2 * NF);
  const R = new Float32Array(n2 * EXITS);
  for (let i = 0; i < n2; i++) {
    const s = rows[i];
    X.set(s.x, i * NF);
    for (let c = 0; c < GRID.length; c++) for (let h = 0; h < H; h++) R[i * EXITS + c * H + h] = exitReturn(s, c, h);
    if (i % 2e3 === 0) yield;
  }
  const d = { rows, X, R };
  const live = st.ideas.filter((i) => i.status !== "retired");
  for (let r = 0; r < n2; r++) {
    const s = rows[r];
    if (s.ts <= st.seenTo) continue;
    for (const i of live) {
      if (s.ts <= i.from || !matches(i, s)) continue;
      i.coins++;
      const e = exitOf(i);
      const v = R[r * EXITS + e];
      if (v !== v) continue;
      const hour2 = hourOf(s.ts);
      i.vals.push(r42(v));
      i.hrs.push(hour2);
      const sec = s.gridT[Math.floor(e / H)] ?? 0;
      i.heldSec += i.hold ? Math.min(sec, i.hold * 60) : sec;
      if (i.status === "proven" && s.ts > (i.provenTo ?? Infinity)) {
        i.post.vals.push(r42(v));
        i.post.hrs.push(hour2);
      }
      if (i.vals.length > LAB.keepVals) {
        i.vals.shift();
        i.hrs.shift();
      }
    }
    if (r % 5e3 === 0) yield;
  }
  if (n2) st.seenTo = Math.max(st.seenTo, rows[n2 - 1].ts);
  const { proven } = judge(st, now);
  const added = [];
  const hours = n2 ? (rows[n2 - 1].ts - rows[0].ts) / 36e5 : 0;
  st.ranAt = now;
  if (n2 < LAB.minRows || hours < LAB.minHours) {
    st.note = `The Lab needs ${LAB.minHours} hours of recorded market and ${LAB.minRows.toLocaleString("en-US")} finished would-be trades to invent from (so far: ${hours.toFixed(1)} h, ${n2.toLocaleString("en-US")}).`;
    return { state: st, proven, added };
  }
  const byEntry = /* @__PURE__ */ new Map();
  rows.forEach((s, i) => {
    let l = byEntry.get(s.tag);
    if (!l) byEntry.set(s.tag, l = []);
    l.push(i);
  });
  const found = [];
  const leads = [];
  const entries = [];
  let tested = 0;
  for (const [at2, list] of byEntry) {
    const idx = Int32Array.from(list);
    const b = bestExit(d, idx);
    const spanDays = Math.max(1 / 24, (rows[list[list.length - 1]].ts - rows[list[0]].ts) / DAY);
    if (b) {
      const c = Math.floor(b.e / H);
      entries.push({ at: at2, perDay: idx.length / spanDays, best: `tp${GRID[c].tp} sl${GRID[c].sl}${HOLDS_MIN[b.e % H] ? ` hold${HOLDS_MIN[b.e % H]}` : ""}`, mean: b.mean });
    }
    if (idx.length < 3 * LAB.minSeen) continue;
    const res = yield* searchEntry(d, at2, idx);
    tested += res.tested;
    found.push(...res.found);
    leads.push(...res.singles);
  }
  st.tested = tested;
  st.entries = entries.sort((a, b) => b.mean - a.mean);
  const toRule = (f2) => ({ at: f2.at, ...f2.stage ? { stage: f2.stage } : {}, conds: f2.conds, tp: GRID[Math.floor(f2.e / H)].tp, sl: GRID[Math.floor(f2.e / H)].sl, hold: HOLDS_MIN[f2.e % H] });
  st.leads = leads.filter((f2) => f2.mean > 0).sort((a, b) => b.lo - a.lo).slice(0, 12).map((f2) => ({ code: labCode(toRule(f2)), n: f2.n, mean: f2.mean }));
  const busy = new Set(st.ideas.filter((i) => i.status !== "retired" || now - (i.retiredAt ?? 0) < LAB.retryAfterMs).map(shapeOf));
  let room = Math.min(LAB.newPerRun, LAB.maxActive - st.ideas.filter((i) => i.source === "search" && i.status === "testing").length);
  const usedEntry = /* @__PURE__ */ new Set();
  for (const f2 of found.sort((a, b) => b.lo - a.lo)) {
    if (room <= 0) break;
    const rule = toRule(f2);
    if (usedEntry.has(rule.at) || busy.has(shapeOf(rule))) continue;
    const idea = newIdea(rule, "search", now, st.seenTo, { n: f2.n, mean: f2.mean, lo: f2.lo });
    st.ideas.push(idea);
    added.push(idea);
    busy.add(shapeOf(rule));
    usedEntry.add(rule.at);
    room--;
  }
  const testing = st.ideas.filter((i) => i.status === "testing").length;
  st.note = `Searched ${tested.toLocaleString("en-US")} rules on ${hours.toFixed(0)} h of market${added.length ? `; ${added.length} new idea${added.length > 1 ? "s" : ""}` : ""}. ${testing} idea${testing === 1 ? "" : "s"} being tested on coins that came after them.`;
  return { state: st, proven, added };
}
async function runLabAsync(samples, prev, opts = {}) {
  const it = labSteps(samples, prev, opts);
  let t = Date.now();
  for (; ; ) {
    const r = it.next();
    if (r.done) return r.value;
    if (Date.now() - t > 15) {
      await new Promise((res) => setTimeout(res, 0));
      t = Date.now();
    }
  }
}
function labProofs(st, now, freshMs = 6 * 36e5) {
  if (st.method !== LAB_METHOD || now - st.ranAt > freshMs) return [];
  return st.ideas.filter((i) => i.status === "proven").map((i) => {
    const all = statsOf(i.vals, i.hrs, STRICT);
    const wins2 = i.vals.filter((v) => v > 0).length;
    const days = Math.max(1 / 24, (st.seenTo - i.from) / DAY);
    return {
      level: i.at.startsWith("x") ? Number(i.at.slice(1)) : 0,
      ...i.at in ENTRY_POINTS ? { at: i.at } : {},
      cond: "lab",
      tp: i.tp,
      sl: i.sl,
      hold: i.hold,
      text: i.text,
      discovery: { n: i.seen?.n ?? 0, mean: i.seen?.mean ?? NaN, lo: i.seen?.lo ?? NaN, winRate: NaN },
      holdout: { n: all.n, mean: all.mean, lo: all.lo, winRate: all.n ? wins2 / all.n : NaN },
      baseline: NaN,
      tradesPerDay: i.coins / days,
      avgHoldMin: all.n ? i.heldSec / all.n / 60 : void 0,
      settings: labSettings(i, st.horizonMs)
    };
  });
}
function labForward(st, text) {
  const i = st.ideas.find((x) => x.text === text && x.provenAt);
  if (!i) return void 0;
  if (i.status === "retired") return i.stopped ? { text, n: Math.max(i.last?.n ?? 0, LAB.postMin), mean: i.last?.mean ?? NaN, lo: -Infinity, hi: -Infinity } : void 0;
  const post = statsOf(i.post.vals, i.post.hrs, 0.95);
  return { text, n: post.n, mean: post.mean, lo: post.lo, hi: post.hi };
}
function labView(st, now = Date.now()) {
  const idea = (i) => {
    const ci = i.status === "retired" ? i.last ?? { n: 0, mean: NaN, lo: NaN, hi: NaN } : statsOf(i.vals, i.hrs, 0.95);
    const next = LAB.looks.find((k) => k > i.vals.length);
    const days = Math.max(1 / 24, (st.seenTo - i.from) / DAY);
    return {
      id: i.id,
      text: i.text,
      code: i.code,
      source: i.source,
      status: i.status,
      born: i.born,
      n: ci.n,
      mean: ci.mean,
      lo: Number.isFinite(ci.lo) ? ci.lo : null,
      hi: Number.isFinite(ci.hi) ? ci.hi : null,
      coinsPerDay: st.seenTo > i.from ? i.coins / days : null,
      nextLook: i.status === "testing" ? next ?? null : null,
      seen: i.seen ?? null,
      proof: i.proof ?? null,
      provenAt: i.provenAt ?? null,
      post: i.status === "proven" ? statsOf(i.post.vals, i.post.hrs, 0.95) : null,
      why: i.why ?? null,
      retiredAt: i.retiredAt ?? null
    };
  };
  const by = (a, b) => b.vals.length - a.vals.length;
  return {
    ranAt: st.ranAt,
    note: st.note,
    tested: st.tested,
    fresh: now - st.ranAt <= 6 * 36e5,
    testing: st.ideas.filter((i) => i.status === "testing").sort(by).map(idea),
    proven: st.ideas.filter((i) => i.status === "proven").map(idea),
    retired: st.ideas.filter((i) => i.status === "retired").sort((a, b) => (b.retiredAt ?? 0) - (a.retiredAt ?? 0)).slice(0, 10).map(idea),
    slots: { search: st.ideas.filter((i) => i.source === "search" && i.status === "testing").length, max: LAB.maxActive, mine: st.ideas.filter((i) => i.source === "you" && i.status === "testing").length, mineMax: LAB.mineMax },
    format: LAB_FORMAT
  };
}
function labSummary(st, you) {
  const hrs = (t) => t ? new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "\u2014";
  const line = (i) => {
    const s = i.status === "retired" ? i.last : statsOf(i.vals, i.hrs, 0.95);
    const res = s && s.n ? `${s.n} coins, ${pct1(s.mean)} per trade${Number.isFinite(s.lo) ? ` (95% range ${pct1(s.lo)} to ${pct1(s.hi)})` : ""}` : "no finished coins yet";
    return `- ${i.code} \u2014 ${res}${i.why ? ` \u2014 ${i.why}` : ""}`;
  };
  const testing = st.ideas.filter((i) => i.status === "testing");
  const proven = st.ideas.filter((i) => i.status === "proven");
  const retired = st.ideas.filter((i) => i.status === "retired").slice(-12);
  return [
    "SIGNAL Lab summary \u2014 pump.fun coins, paper-traded would-be entries. Please propose up to 5 new rules for the Lab to test, one per line, in the format below, each with one sentence on why it might work. They will be judged only on coins that come after they are added.",
    "",
    `Format: ${LAB_FORMAT}`,
    'Returns are per trade after fees, delay and slippage. "hold" = sell after that many minutes if neither target nor stop was hit.',
    "",
    `Data up to ${hrs(st.seenTo)}. Last search: ${st.note}`,
    "",
    "Entries (coins a day \xB7 best plain exit on past data \xB7 its average per trade):",
    ...st.entries.map((e) => `- ${e.at.startsWith("x") ? `score${e.at.slice(1)}` : e.at} \xB7 ${e.perDay.toFixed(0)}/day \xB7 ${e.best} \xB7 ${pct1(e.mean)}`),
    "",
    "Strongest single conditions in the last search (past data \u2014 hints, not proof):",
    ...st.leads.length ? st.leads.map((l) => `- ${l.code} \xB7 ${l.n} trades \xB7 ${pct1(l.mean)} per trade`) : ["- none yet"],
    "",
    "Being tested now (coins after each idea was added):",
    ...testing.length ? testing.map(line) : ["- none"],
    ...proven.length ? ["", "Proven:", ...proven.map(line)] : [],
    ...retired.length ? ["", "Retired (did not hold up):", ...retired.map(line)] : [],
    "",
    `The bot's rule now: ${you.rule}${you.record ? ` \u2014 ${you.record}` : ""}.`
  ].join("\n");
}

// src/core/presets.ts
var BASE = { entryAt: "score", conds: [], trailPct: 0, takeInitials: false, reentry: false, tradeCurve: true, tradeAmm: true, scoreOnly: true };
var PRESETS = [
  {
    key: "plan",
    name: "Your plan",
    note: "Buy when a coin reaches 75 \xB7 sell at 2\xD7 or \u221250% \xB7 time limit 4 hours. Score only.",
    proof: "yours",
    settings: { ...BASE, minScore: 75, tpPct: 100, slPct: 50, maxHoldMin: 240 }
  },
  {
    key: "sim-momentum",
    name: "Simulator finding: fast momentum",
    note: "Buy when a coin reaches 95 \xB7 sell at +500% or \u221220%, or after 10 minutes. It won in the simulator, which has more momentum than pump.fun \u2014 paper-test it before trusting it.",
    proof: "unproven",
    settings: { ...BASE, minScore: 95, tpPct: 500, slPct: 20, maxHoldMin: 10 }
  }
];
function followsPreset(s, p) {
  for (const [k, v] of Object.entries(p)) {
    if (k === "filters") {
      for (const [fk, fv] of Object.entries(v)) if (s.filters[fk] !== fv) return false;
    } else if (k === "conds") {
      if (JSON.stringify(s.conds ?? []) !== JSON.stringify(v ?? [])) return false;
    } else if (s[k] !== v) return false;
  }
  return true;
}
function ruleSummary(s) {
  const time = s.maxHoldMin > 0 ? s.maxHoldMin >= 120 && s.maxHoldMin % 60 === 0 ? `${s.maxHoldMin / 60} h` : `${s.maxHoldMin} min` : "no time limit";
  const entry = s.entryAt && s.entryAt !== "score" ? entryLabel(s.entryAt) : `score \u2265 ${s.minScore}`;
  const when = s.conds?.length ? ` \xB7 ${s.conds.map(describeCond).join(", ")}` : "";
  return `${entry}${when} \xB7 +${s.tpPct}% / \u2212${s.slPct}% \xB7 ${time}`;
}
var signedPct2 = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
function strategyList(report) {
  const found = report?.survivors?.slice(0, 3) ?? [];
  return [
    ...PRESETS,
    ...found.map((e) => ({
      key: `edge:${e.text}`,
      name: "Found in your data",
      note: `${e.text}. ${signedPct2(e.holdout.mean)} per trade on ${e.holdout.n} trades the search never saw.`,
      proof: "data",
      settings: e.settings
    }))
  ];
}

// src/node/config.ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
function loadDotEnv(path = ".env") {
  const p = resolve(path);
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"') || v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    if (process.env[k] === void 0) process.env[k] = v;
  }
}
var PUBLIC_RPC_HTTP = "https://api.mainnet-beta.solana.com";
var PUBLIC_RPC_WS = "wss://api.mainnet-beta.solana.com";
var isPublicRpc = (u) => /api\.mainnet(-beta)?\.solana\.com/i.test(u);
function n(v, d) {
  const x = Number(v);
  return v !== void 0 && v !== "" && Number.isFinite(x) ? x : d;
}
function loadConfig(env = process.env, argv = process.argv) {
  const sim = argv.includes("--sim") || env.SIM === "1" || env.SIM === "true";
  const feedList = (env.FEEDS ?? (sim ? "sim" : "rpc,pumpportal,dexscreener")).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const feeds = /* @__PURE__ */ new Set();
  for (const f2 of feedList) if (f2 === "rpc" || f2 === "pumpportal" || f2 === "dexscreener" || f2 === "sim") feeds.add(f2);
  if (sim) {
    feeds.clear();
    feeds.add("sim");
  }
  const rpcHttp = env.RPC_URL ?? env.RPC_HTTP_URL ?? PUBLIC_RPC_HTTP;
  const rpcWs = env.RPC_WS_URL ?? rpcHttp.replace(/^http/, "ws");
  const streamSource = env.STREAM_SOURCE === "rpc" && !isPublicRpc(rpcWs) ? "rpc" : "public";
  const streamWs = streamSource === "rpc" ? rpcWs : env.STREAM_WS_URL || PUBLIC_RPC_WS;
  const level = env.LOG_LEVEL ?? "info";
  return {
    port: n(env.PORT, 8787),
    host: env.HOST ?? "0.0.0.0",
    dataDir: resolve(env.DATA_DIR ?? "./data"),
    dashboardToken: env.DASHBOARD_TOKEN ?? "",
    rpcWs,
    rpcHttp,
    streamWs,
    streamSource,
    streamBudgetMb: Math.max(0, n(env.STREAM_BUDGET_MB_PER_DAY, 1500)),
    ammFirehose: env.AMM_FIREHOSE === "1" || env.AMM_FIREHOSE === "true",
    feeds,
    pumpPortalApiKey: env.PUMPPORTAL_API_KEY ?? "",
    telegramToken: env.TELEGRAM_BOT_TOKEN ?? "",
    telegramChatId: env.TELEGRAM_CHAT_ID ?? "",
    liveTrading: env.LIVE_TRADING === "I_UNDERSTAND_THE_RISK",
    walletSecret: env.WALLET_PRIVATE_KEY ?? "",
    liveMaxPositionSol: n(env.LIVE_MAX_POSITION_SOL, 0.05),
    liveMaxDailyLossSol: n(env.LIVE_MAX_DAILY_LOSS_SOL, 0.25),
    jitoTipSol: n(env.JITO_TIP_SOL, 0),
    record: env.RECORD !== "0" && env.RECORD !== "false",
    recordDays: n(env.RECORD_DAYS, 5),
    sampleDays: n(env.SAMPLE_DAYS, 30),
    dataMaxGb: env.DATA_MAX_GB && env.DATA_MAX_GB !== "auto" && Number(env.DATA_MAX_GB) > 0 ? Number(env.DATA_MAX_GB) : null,
    minFreeGb: n(env.MIN_FREE_GB, 2),
    learnEveryHours: n(env.LEARN_EVERY_HOURS, 2),
    simSpeed: n(env.SIM_SPEED, 1),
    simPredictability: n(env.SIM_PREDICTABILITY, 0.7),
    githubToken: env.GITHUB_TOKEN ?? "",
    githubRepo: env.GITHUB_SYNC_REPO ?? "",
    githubBranch: env.GITHUB_SYNC_BRANCH ?? "signal-data",
    logLevel: ["debug", "info", "warn", "error"].includes(level) ? level : "info",
    metadata: env.FETCH_METADATA !== "0"
  };
}
var hide = (s) => s ? `set (${s.length} chars)` : "not set";
function describeConfig(c) {
  const host = (u) => {
    try {
      return new URL(u).host;
    } catch {
      return "invalid url";
    }
  };
  return {
    feeds: [...c.feeds],
    rpc: host(c.rpcHttp),
    rpcIsPublic: isPublicRpc(c.rpcHttp),
    stream: host(c.streamWs),
    streamSource: c.streamSource,
    ammFirehose: c.ammFirehose,
    pumpPortalApiKey: hide(c.pumpPortalApiKey),
    telegram: c.telegramToken && c.telegramChatId ? "on" : "off",
    liveTrading: c.liveTrading ? "enabled by server" : "disabled by server",
    wallet: c.walletSecret ? "configured" : "none",
    liveMaxPositionSol: c.liveMaxPositionSol,
    liveMaxDailyLossSol: c.liveMaxDailyLossSol,
    recording: c.record ? `on (${c.recordDays} days kept)` : "off",
    storage: `${c.dataMaxGb === null ? "a fifth of the disk (10\u2013100 GB)" : `at most ${c.dataMaxGb} GB`}, keeping ${c.minFreeGb} GB of the disk free`,
    learnEveryHours: c.learnEveryHours,
    dataDir: c.dataDir,
    githubSync: c.githubRepo ? `${c.githubRepo}@${c.githubBranch}` : "off"
  };
}

// src/node/http.ts
async function getJson(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8e3);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json", ...opts.headers ?? {} } });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 2e7) return null;
    return JSON.parse(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
async function postJson(url, body, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 1e4);
  try {
    const res = await fetch(url, { method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json", ...opts.headers ?? {} }, body: JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, text: text.slice(0, 2e3) };
  } catch (e) {
    return { ok: false, status: 0, json: null, text: String(e) };
  } finally {
    clearTimeout(timer);
  }
}
var RateLimiter = class {
  constructor(perMinute, burst = Math.max(1, Math.floor(perMinute / 6))) {
    this.perMinute = perMinute;
    this.burst = burst;
    this.tokens = this.burst;
  }
  tokens;
  last = Date.now();
  tryTake() {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + (now - this.last) * this.perMinute / 6e4);
    this.last = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
};

// src/node/feeds/dexscreener.ts
var BASE2 = "https://api.dexscreener.com";
var WSOL = "So11111111111111111111111111111111111111112";
function pairToQuote(p, ts) {
  const mint = p.baseToken?.address;
  if (p.chainId !== "solana" || !mint) return null;
  const priceSol = p.quoteToken?.address === WSOL ? Number(p.priceNative) : void 0;
  return {
    k: "quote",
    ts,
    src: "dexscreener",
    mint,
    priceUsd: p.priceUsd ? Number(p.priceUsd) : void 0,
    priceSol: priceSol && Number.isFinite(priceSol) ? priceSol : void 0,
    mcapUsd: p.marketCap ?? p.fdv,
    liqUsd: p.liquidity?.usd,
    vol5mUsd: p.volume?.m5,
    vol1hUsd: p.volume?.h1,
    buys5m: p.txns?.m5?.buys,
    sells5m: p.txns?.m5?.sells,
    chg5m: p.priceChange?.m5,
    chg1h: p.priceChange?.h1,
    pairAddress: p.pairAddress,
    dexId: p.dexId,
    pairCreatedAt: p.pairCreatedAt,
    name: p.baseToken?.name,
    symbol: p.baseToken?.symbol
  };
}
var DexScreenerFeed = class {
  constructor(o) {
    this.o = o;
  }
  timers = [];
  tokenLimiter = new RateLimiter(240, 20);
  profileLimiter = new RateLimiter(40, 4);
  h = { name: "dexscreener", status: "off", lastMsgAt: 0, msgs: 0, reconnects: 0, errors: 0, critical: false };
  start() {
    this.h.status = "open";
    this.o.onHealth({ ...this.h });
    this.timers.push(setInterval(() => void this.pollProfiles(), 6e4));
    this.timers.push(setInterval(() => void this.pollQuotes(), 15e3));
    void this.pollProfiles();
  }
  stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.h.status = "off";
  }
  ok() {
    this.h.lastMsgAt = Date.now();
    this.h.msgs++;
    this.h.status = "open";
    this.o.onHealth({ ...this.h });
  }
  fail(what) {
    this.h.errors++;
    this.h.note = `${what} failed`;
    this.o.onHealth({ ...this.h });
  }
  async pollProfiles() {
    for (const [path, kind] of [
      ["/token-profiles/latest/v1", "profile"],
      ["/token-boosts/latest/v1", "boost"]
    ]) {
      if (!this.profileLimiter.tryTake()) continue;
      const rows = await getJson(BASE2 + path);
      if (!Array.isArray(rows)) {
        this.fail(path);
        continue;
      }
      this.ok();
      const ts = Date.now();
      for (const r of rows) {
        if (r.chainId !== "solana" || !r.tokenAddress) continue;
        const links = r.links ?? [];
        const find = (t) => links.find((l) => (l.type ?? l.label ?? "").toLowerCase().includes(t))?.url;
        this.o.onEvent({
          k: "meta",
          ts,
          src: "dexscreener",
          mint: r.tokenAddress,
          dexProfile: kind === "profile" ? true : void 0,
          boosts: kind === "boost" ? r.totalAmount ?? r.amount ?? 1 : void 0,
          twitter: find("twitter") ?? find("x"),
          telegram: find("telegram"),
          website: links.find((l) => (l.label ?? "").toLowerCase() === "website")?.url,
          description: r.description,
          image: r.icon
        });
      }
    }
  }
  async pollQuotes() {
    const list = [...new Set(this.o.watchlist())].slice(0, 300);
    for (let i = 0; i < list.length; i += 30) {
      if (!this.tokenLimiter.tryTake()) break;
      const chunk = list.slice(i, i + 30);
      const pairs = await getJson(`${BASE2}/tokens/v1/solana/${chunk.join(",")}`);
      if (!Array.isArray(pairs)) {
        this.fail("tokens");
        continue;
      }
      this.ok();
      const ts = Date.now();
      const best = /* @__PURE__ */ new Map();
      for (const p of pairs) {
        const m = p.baseToken?.address;
        if (!m) continue;
        const cur = best.get(m);
        if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) best.set(m, p);
      }
      for (const p of best.values()) {
        const q = pairToQuote(p, ts);
        if (q) this.o.onEvent(q);
      }
    }
  }
};

// src/node/feeds/metadata.ts
var GATEWAYS = ["https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://gateway.pinata.cloud/ipfs/"];
function candidateUrls(uri) {
  const out = [];
  if (/^https?:\/\//.test(uri)) out.push(uri);
  const cid = /\/ipfs\/([A-Za-z0-9]+)/.exec(uri)?.[1] ?? (/^ipfs:\/\/([A-Za-z0-9]+)/.exec(uri)?.[1] ?? null);
  if (cid) {
    for (const g of GATEWAYS) if (!out.some((u) => u.startsWith(g))) out.push(g + cid);
  }
  return out.slice(0, 3);
}
var MetadataFetcher = class {
  constructor(o) {
    this.o = o;
  }
  queue = [];
  active = 0;
  done = new LRU(2e4);
  fetched = 0;
  failed = 0;
  request(mint, uri) {
    if (!uri || this.done.has(mint)) return;
    this.done.set(mint, 1);
    this.queue.push({ mint, uri, at: Date.now() });
    const max = this.o.maxQueue ?? 400;
    if (this.queue.length > max) this.queue.splice(0, this.queue.length - max);
    this.pump();
  }
  pump() {
    const limit = this.o.concurrency ?? 6;
    while (this.active < limit && this.queue.length) {
      const job = this.queue.shift();
      if (Date.now() - job.at > 12e4) continue;
      this.active++;
      void this.run(job).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }
  async run(job) {
    for (const url of candidateUrls(job.uri)) {
      const j = await getJson(url, { timeoutMs: 4e3 });
      if (!j || typeof j !== "object") continue;
      const str = (x) => typeof x === "string" && x.length < 500 ? x : void 0;
      this.fetched++;
      this.o.onEvent({
        k: "meta",
        ts: Date.now(),
        src: "pumpportal",
        mint: job.mint,
        twitter: str(j.twitter),
        telegram: str(j.telegram),
        website: str(j.website),
        description: str(j.description),
        image: str(j.image)
      });
      return;
    }
    this.failed++;
  }
};

// src/node/feeds/pools.ts
function parsePoolAccount(data) {
  if (data.length < 8 + 1 + 2 + 32 * 3) return null;
  const base = data.subarray(43, 75);
  const quote = data.subarray(75, 107);
  return { baseMint: base58Encode(base), quoteMint: base58Encode(quote) };
}
var PoolResolver = class {
  constructor(o) {
    this.o = o;
  }
  pending = /* @__PURE__ */ new Set();
  failed = /* @__PURE__ */ new Map();
  timer = null;
  resolved = 0;
  request(pool) {
    if ((this.failed.get(pool) ?? 0) > Date.now()) return;
    this.pending.add(pool);
    if (!this.timer) this.timer = setTimeout(() => void this.flush(), 1500);
  }
  async flush() {
    this.timer = null;
    const batch = [...this.pending].slice(0, 100);
    for (const p of batch) this.pending.delete(p);
    if (batch.length === 0) return;
    const res = await postJson(this.o.rpcHttp, {
      jsonrpc: "2.0",
      id: 1,
      method: "getMultipleAccounts",
      params: [batch, { encoding: "base64" }]
    });
    const vals = res.json?.result?.value;
    if (!Array.isArray(vals)) {
      for (const p of batch) this.failed.set(p, Date.now() + 6e4);
      return;
    }
    vals.forEach((acc, i) => {
      const pool = batch[i];
      if (!acc?.data?.[0]) {
        this.failed.set(pool, Date.now() + 10 * 6e4);
        return;
      }
      const parsed = parsePoolAccount(base64Decode(acc.data[0]));
      if (!parsed || parsed.quoteMint !== WSOL_MINT) {
        this.failed.set(pool, Date.now() + 24 * 36e5);
        return;
      }
      this.resolved++;
      this.o.onResolved(pool, parsed.baseMint);
    });
    if (this.pending.size && !this.timer) this.timer = setTimeout(() => void this.flush(), 1500);
  }
};

// node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);
var wrapper_default = import_websocket.default;

// src/node/ws.ts
var redactKeys = (s) => s.replace(/(api[-_]?key=)[^&\s"']+/gi, "$1***");
var ReconnectingWS = class {
  constructor(o) {
    this.o = o;
    this.h = { name: o.name, status: "off", lastMsgAt: 0, msgs: 0, reconnects: 0, errors: 0, critical: o.critical };
  }
  ws = null;
  timer = null;
  heartbeat = null;
  attempts = 0;
  stopped = true;
  lastAliveAt = 0;
  /** the socket's last error, shown with the next "closed" (e.g. the server refused the key) */
  lastError = "";
  /** network bytes of the sockets before the current one */
  wireBase = 0;
  h;
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }
  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.timer = null;
    this.heartbeat = null;
    try {
      this.ws?.removeAllListeners();
      this.ws?.terminate();
    } catch {
    }
    this.ws = null;
    this.setStatus("off");
  }
  send(msg) {
    if (!this.ws || this.ws.readyState !== wrapper_default.OPEN) return false;
    try {
      this.ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
      return true;
    } catch (e) {
      this.h.errors++;
      this.o.log.warn(`${this.o.name}: send failed`, { err: String(e) });
      return false;
    }
  }
  get open() {
    return this.ws?.readyState === wrapper_default.OPEN;
  }
  /** Drops the connection and connects again right away (to pick up a new address). */
  reconnect() {
    if (this.stopped) return;
    this.attempts = 0;
    const ws = this.ws;
    if (!ws) return;
    try {
      ws.terminate();
    } catch {
    }
  }
  setStatus(s, note) {
    this.h.status = s;
    if (note !== void 0) this.h.note = redactKeys(note);
    try {
      this.o.onHealth?.(this.h);
    } catch {
    }
  }
  connect() {
    if (this.stopped) return;
    let url;
    try {
      url = this.o.url();
    } catch (e) {
      this.setStatus("down", `bad url: ${String(e)}`);
      return;
    }
    try {
      this.h.host = new URL(url).host;
    } catch {
      this.h.host = "";
    }
    this.setStatus("connecting");
    let ws;
    try {
      ws = new wrapper_default(url, { handshakeTimeout: 15e3, perMessageDeflate: true, maxPayload: 16 * 1024 * 1024 });
    } catch (e) {
      this.h.errors++;
      this.schedule(`connect threw: ${String(e)}`);
      return;
    }
    this.ws = ws;
    ws.on("open", () => {
      this.attempts = 0;
      this.lastError = "";
      this.wireBase = this.h.wire ?? 0;
      this.lastAliveAt = Date.now();
      this.setStatus("open", "");
      this.o.log.info(`${this.o.name}: connected`);
      try {
        this.o.onOpen((m) => this.send(m));
      } catch (e) {
        this.o.log.error(`${this.o.name}: onOpen failed`, { err: String(e) });
      }
      this.startHeartbeat();
    });
    ws.on("message", (data) => {
      const now = Date.now();
      this.lastAliveAt = now;
      this.h.lastMsgAt = now;
      this.h.msgs++;
      this.h.bytes = (this.h.bytes ?? 0) + (Array.isArray(data) ? data.reduce((n2, b) => n2 + b.length, 0) : data.byteLength);
      const socket = ws._socket;
      if (typeof socket?.bytesRead === "number") this.h.wire = this.wireBase + socket.bytesRead;
      try {
        this.o.onMessage(data.toString());
      } catch (e) {
        this.h.errors++;
        if (this.h.errors < 20 || this.h.errors % 500 === 0) this.o.log.warn(`${this.o.name}: message handler error`, { err: String(e) });
      }
    });
    ws.on("pong", () => {
      this.lastAliveAt = Date.now();
    });
    ws.on("error", (e) => {
      this.h.errors++;
      this.lastError = redactKeys(String(e.message ?? e)).slice(0, 120);
      this.o.log.warn(`${this.o.name}: socket error`, { err: this.lastError });
    });
    ws.on("close", (code, reason) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      const why = reason?.length ? reason.toString().slice(0, 80) : this.lastError;
      this.schedule(`closed ${code}${why ? ` \u2014 ${why}` : ""}`);
    });
  }
  startHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    const ping = this.o.pingMs ?? 15e3;
    const stale = this.o.staleMs ?? 6e4;
    this.heartbeat = setInterval(() => {
      const ws = this.ws;
      if (!ws) return;
      const now = Date.now();
      const silentFor = now - Math.max(this.h.lastMsgAt, this.lastAliveAt - ping * 2);
      if (now - this.lastAliveAt > ping * 3 || now - (this.h.lastMsgAt || this.lastAliveAt) > stale) {
        this.o.log.warn(`${this.o.name}: no data for ${Math.round(silentFor / 1e3)}s \u2014 reconnecting`);
        try {
          ws.terminate();
        } catch {
        }
        return;
      }
      try {
        ws.ping();
      } catch {
      }
    }, ping);
    this.heartbeat.unref?.();
  }
  schedule(why) {
    if (this.stopped) return;
    this.h.reconnects++;
    const min = this.o.minBackoffMs ?? 1e3;
    const max = this.o.maxBackoffMs ?? 3e4;
    const ceil = Math.min(max, min * 2 ** Math.min(this.attempts, 10));
    const delay = Math.round(ceil / 2 + Math.random() * (ceil / 2));
    this.attempts++;
    this.setStatus("down", why);
    this.o.log.warn(`${this.o.name}: ${redactKeys(why)}; retry in ${(delay / 1e3).toFixed(1)}s`);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), delay);
  }
};

// src/node/feeds/pumpportal.ts
var num2 = (x) => typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN;
function parsePumpPortal(m, ts) {
  const tx = m.txType;
  const mint = m.mint;
  if (typeof mint !== "string" || !isAddress(mint)) return [];
  const pool = typeof m.pool === "string" ? m.pool : "pump";
  if (tx === "create") {
    if (pool !== "pump") return [];
    const creator = typeof m.traderPublicKey === "string" ? m.traderPublicKey : "";
    const create = {
      k: "create",
      ts,
      sig: typeof m.signature === "string" ? m.signature : void 0,
      src: "pumpportal",
      mint,
      name: String(m.name ?? "").slice(0, 64),
      symbol: String(m.symbol ?? "").slice(0, 24),
      uri: String(m.uri ?? ""),
      creator,
      user: creator,
      vSol: CURVE.initialVirtualSol,
      vTok: CURVE.initialVirtualTok,
      realTok: CURVE.initialRealTok,
      supply: CURVE.supply
    };
    const out = [create];
    const vSol = num2(m.vSolInBondingCurve) * LAMPORTS_PER_SOL;
    const vTok = num2(m.vTokensInBondingCurve) * RAW_PER_TOKEN;
    const tok = num2(m.initialBuy) * RAW_PER_TOKEN;
    const sol2 = num2(m.solAmount) * LAMPORTS_PER_SOL;
    if (tok > 0 && vSol > 0 && vTok > 0) {
      out.push({ k: "trade", ts, sig: create.sig, src: "pumpportal", mint, buy: true, sol: Math.round(sol2 / 1.0125), tok, user: creator, venue: "curve", vSol, vTok });
    }
    return out;
  }
  if (tx === "buy" || tx === "sell") {
    const vSol = num2(m.vSolInBondingCurve) * LAMPORTS_PER_SOL;
    const vTok = num2(m.vTokensInBondingCurve) * RAW_PER_TOKEN;
    const tok = num2(m.tokenAmount) * RAW_PER_TOKEN;
    const sol2 = num2(m.solAmount) * LAMPORTS_PER_SOL;
    if (!(vSol > 0) || !(vTok > 0) || !(tok >= 0) || !(sol2 >= 0)) return [];
    const trade = {
      k: "trade",
      ts,
      sig: typeof m.signature === "string" ? m.signature : void 0,
      src: "pumpportal",
      mint,
      buy: tx === "buy",
      sol: sol2,
      tok,
      user: typeof m.traderPublicKey === "string" ? m.traderPublicKey : "unknown",
      venue: pool === "pump" ? "curve" : "amm",
      vSol,
      vTok
    };
    return [trade];
  }
  if (tx === "migrate") return [{ k: "migrate", ts, src: "pumpportal", mint, sig: typeof m.signature === "string" ? m.signature : void 0 }];
  return [];
}
var PumpPortalFeed = class {
  constructor(o) {
    this.o = o;
    const base = "wss://pumpportal.fun/api/data";
    this.ws = new ReconnectingWS({
      name: "pumpportal",
      url: () => o.apiKey ? `${base}?api-key=${encodeURIComponent(o.apiKey)}` : base,
      critical: o.critical,
      staleMs: 12e4,
      pingMs: 2e4,
      log: o.log,
      onHealth: o.onHealth,
      onOpen: (send) => {
        send({ method: "subscribeNewToken" });
        send({ method: "subscribeMigration" });
        if (o.apiKey && this.watched.size) send({ method: "subscribeTokenTrade", keys: [...this.watched].slice(0, 5e3) });
      },
      onMessage: (text) => this.onMessage(text)
    });
  }
  ws;
  watched = /* @__PURE__ */ new Set();
  start() {
    this.ws.start();
  }
  stop() {
    this.ws.stop();
  }
  /** Stream trades for a coin (API key only; free tier ignores this). */
  watch(mint, on) {
    if (!this.o.apiKey) return;
    if (on) {
      if (this.watched.has(mint)) return;
      this.watched.add(mint);
      this.ws.send({ method: "subscribeTokenTrade", keys: [mint] });
    } else if (this.watched.delete(mint)) {
      this.ws.send({ method: "unsubscribeTokenTrade", keys: [mint] });
    }
  }
  onMessage(text) {
    let m;
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof m.message === "string") {
      this.o.log.info(`pumpportal: ${m.message.slice(0, 160)}`);
      return;
    }
    if (typeof m.errors === "string" || typeof m.error === "string") {
      this.o.log.warn("pumpportal: error", { error: m.errors ?? m.error });
      return;
    }
    for (const ev of parsePumpPortal(m, Date.now())) this.o.onEvent(ev);
  }
  get health() {
    return this.ws.h;
  }
};

// src/node/feeds/rpc.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync } from "node:fs";
var GRADUATE_WATCH_MS = 60 * 6e4;
var MAX_GRADUATES = 10;
var utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
var RpcLogsFeed = class {
  constructor(o) {
    this.o = o;
    this.loadUsage();
    this.ws = new ReconnectingWS({
      name: "solana-rpc",
      url: () => this.onFree && o.fallbackUrl ? o.fallbackUrl : o.url,
      critical: true,
      staleMs: 45e3,
      pingMs: 15e3,
      log: o.log,
      onHealth: o.onHealth,
      onOpen: (send) => {
        this.pending.clear();
        this.active.clear();
        const commitment = o.commitment ?? "processed";
        send({ jsonrpc: "2.0", id: 1, method: "logsSubscribe", params: [{ mentions: [PUMP_PROGRAM] }, { commitment }] });
        if (o.ammFirehose) send({ jsonrpc: "2.0", id: 2, method: "logsSubscribe", params: [{ mentions: [PUMP_AMM_PROGRAM] }, { commitment }] });
        this.reconcile();
      },
      onMessage: (text) => this.onMessage(text)
    });
    this.showBudget();
  }
  ws;
  seen = new LRU(5e4);
  nextId = 10;
  /** pool subscriptions: request id → pool while waiting, pool → subscription id once active */
  pending = /* @__PURE__ */ new Map();
  active = /* @__PURE__ */ new Map();
  graduates = /* @__PURE__ */ new Map();
  /** pools the server would not let us follow, and when to try again */
  refused = /* @__PURE__ */ new Map();
  timer = null;
  day = utcDay();
  usedToday = 0;
  savedUsage = 0;
  onFree = false;
  truncated = 0;
  failedTx = 0;
  decoded = 0;
  start() {
    this.ws.start();
    if (!this.timer) {
      this.timer = setInterval(() => {
        this.rollDay();
        this.reconcile();
        this.saveUsage();
      }, this.o.poolCheckMs ?? 5e3);
      this.timer.unref?.();
    }
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.saveUsage();
    this.ws.stop();
  }
  /** Pools followed right now (held coins and recent graduates). */
  get pools() {
    return [...this.active.keys()];
  }
  // ---- pools, one by one --------------------------------------------------------------
  /** A coin we followed graduated: follow its pool for a while (unless the whole stream runs). */
  graduated(pool) {
    if (this.o.ammFirehose) return;
    this.graduates.delete(pool);
    this.graduates.set(pool, Date.now() + GRADUATE_WATCH_MS);
    while (this.graduates.size > MAX_GRADUATES) this.graduates.delete(this.graduates.keys().next().value);
    this.reconcile();
  }
  wanted() {
    const now = Date.now();
    for (const [pool, until] of this.graduates) if (until < now) this.graduates.delete(pool);
    let held = [];
    try {
      held = this.o.followPools?.() ?? [];
    } catch {
      held = [];
    }
    return /* @__PURE__ */ new Set([...held, ...this.graduates.keys()]);
  }
  /** Subscribes to pools newly wanted and drops the ones no longer wanted. */
  reconcile() {
    if (this.o.ammFirehose || !this.ws.open) return;
    const want = this.wanted();
    for (const [pool, sub] of this.active) {
      if (want.has(pool)) continue;
      this.active.delete(pool);
      this.ws.send({ jsonrpc: "2.0", id: this.nextId++, method: "logsUnsubscribe", params: [sub] });
    }
    const waiting = new Set(this.pending.values());
    const now = Date.now();
    for (const pool of want) {
      if (this.active.has(pool) || waiting.has(pool) || (this.refused.get(pool) ?? 0) > now) continue;
      const id = this.nextId++;
      this.pending.set(id, pool);
      this.ws.send({ jsonrpc: "2.0", id, method: "logsSubscribe", params: [{ mentions: [pool] }, { commitment: this.o.commitment ?? "processed" }] });
    }
  }
  // ---- daily budget on a metered key ----------------------------------------------------
  get metered() {
    return !!this.o.budgetMb && !!this.o.fallbackUrl;
  }
  loadUsage() {
    if (!this.o.budgetFile || !existsSync2(this.o.budgetFile)) return;
    try {
      const u = JSON.parse(readFileSync2(this.o.budgetFile, "utf8"));
      if (u.day === this.day && Number.isFinite(u.bytes)) this.usedToday = this.savedUsage = Number(u.bytes);
    } catch {
    }
    if (this.metered && this.usedToday > this.o.budgetMb * 1e6) this.onFree = true;
  }
  saveUsage() {
    if (!this.o.budgetFile || !this.metered || this.usedToday === this.savedUsage) return;
    try {
      writeFileSync(this.o.budgetFile, JSON.stringify({ day: this.day, bytes: this.usedToday }));
      this.savedUsage = this.usedToday;
    } catch {
    }
  }
  rollDay() {
    const d = utcDay();
    if (d === this.day) return;
    this.day = d;
    this.usedToday = 0;
    if (this.onFree) {
      this.onFree = false;
      this.o.log.info("solana-rpc: new day \u2014 back to the stream through your key");
      this.ws.reconnect();
    }
    this.showBudget();
  }
  count(bytes) {
    if (!this.metered || this.onFree) return;
    this.usedToday += bytes;
    if (this.usedToday > this.o.budgetMb * 1e6) {
      this.onFree = true;
      this.o.log.warn(`solana-rpc: today's ${this.o.budgetMb} MB for your key is used \u2014 on the free public feed until 00:00 UTC`);
      this.saveUsage();
      this.o.onBudgetSpent?.(this.o.budgetMb);
      this.ws.reconnect();
    }
    this.showBudget();
  }
  showBudget() {
    if (!this.metered) return;
    this.ws.h.budget = { usedMb: Math.round(this.usedToday / 1e5) / 10, limitMb: this.o.budgetMb, onFree: this.onFree };
  }
  // ---- messages -----------------------------------------------------------------------
  onMessage(text) {
    this.rollDay();
    this.count(text.length);
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg.id !== void 0 && this.pending.has(msg.id)) {
      const pool = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (typeof msg.result === "number") {
        this.active.set(pool, msg.result);
        this.refused.delete(pool);
      } else {
        this.refused.set(pool, Date.now() + 5 * 6e4);
        this.o.log.warn("solana-rpc: could not follow a pool \u2014 trying again in 5 min", { pool, error: msg.error?.message });
      }
      return;
    }
    if (msg.error) {
      this.o.log.warn("solana-rpc: error from RPC", { code: msg.error.code, message: msg.error.message });
      this.ws.h.note = `RPC error: ${msg.error.message ?? msg.error.code}`;
      return;
    }
    if (msg.id !== void 0 && msg.result !== void 0) {
      if (msg.id === 1 || msg.id === 2) this.o.log.info(`solana-rpc: subscription ${msg.id} active`);
      return;
    }
    if (msg.method !== "logsNotification") return;
    const res = msg.params?.result;
    const v = res?.value;
    if (!v || !Array.isArray(v.logs) || typeof v.signature !== "string") return;
    if (v.err) {
      this.failedTx++;
      return;
    }
    if (this.seen.has(v.signature)) return;
    this.seen.set(v.signature, 1);
    if (v.logs.some((l) => l === "Log truncated")) this.truncated++;
    const evs = decodeLogs(v.logs, { ts: Date.now(), slot: res?.context?.slot, sig: v.signature, src: "rpc" });
    for (const ev of evs) {
      this.decoded++;
      const pool = ev.k === "migrate" ? ev.pool : ev.k === "pool" && ev.quoteIsSol ? ev.pool : void 0;
      if (pool) this.graduated(pool);
      this.o.onEvent(ev);
    }
  }
  get health() {
    return this.ws.h;
  }
};

// src/sim/market.ts
var DEFAULT_SIM = {
  seed: 42,
  startTs: Date.UTC(2026, 8, 1, 14, 0, 0),
  durationMs: 60 * 6e4,
  launchesPerMin: 6,
  predictability: 0.7,
  smartWallets: 40,
  retailWallets: 4e3,
  stepMs: 250
};
var WORDS = [
  "pepe",
  "doge",
  "cat",
  "frog",
  "moon",
  "chad",
  "wojak",
  "bonk",
  "milady",
  "jeet",
  "sigma",
  "based",
  "goat",
  "pnut",
  "hawk",
  "tuah",
  "jean",
  "phil",
  "dance",
  "grok",
  "neiro",
  "shib",
  "floki",
  "kitty",
  "bull",
  "bear",
  "pump",
  "wif",
  "hat",
  "gigachad",
  "wagmi",
  "fartcoin",
  "ai",
  "agent",
  "trump",
  "elon",
  "zerebro",
  "luna",
  "banana",
  "monkey",
  "ape",
  "penguin",
  "pengu",
  "turbo",
  "brett",
  "andy",
  "landwolf",
  "mog",
  "popcat",
  "michi",
  "mew",
  "slerf",
  "ponke",
  "giga",
  "spx",
  "ansem",
  "orca",
  "fish",
  "whale",
  "dragon",
  "tiger",
  "panda",
  "duck",
  "chicken",
  "hamster",
  "capybara",
  "otter"
];
function pick(r, xs) {
  return xs[Math.floor(r() * xs.length)];
}
function lognormal(r, mu, sigma) {
  const u = Math.max(1e-12, r());
  const v = r();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.exp(mu + sigma * z);
}
function poisson(r, lambda) {
  if (lambda <= 0) return 0;
  if (lambda < 30) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= r();
    } while (p > L);
    return k - 1;
  }
  const u = Math.max(1e-12, r());
  const v = r();
  return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)));
}
var MarketSim = class {
  opts;
  r;
  launchedCount = 0;
  active = [];
  retail = [];
  smart = [];
  devs = [];
  recentNames = [];
  now;
  slot0 = 3e8;
  truth = /* @__PURE__ */ new Map();
  constructor(opts = {}) {
    this.opts = { ...DEFAULT_SIM, ...opts };
    this.r = rng(this.opts.seed);
    this.now = this.opts.startTs;
    for (let i = 0; i < this.opts.retailWallets; i++) this.retail.push(this.key());
    for (let i = 0; i < this.opts.smartWallets; i++) this.smart.push(this.key());
    for (let i = 0; i < 300; i++) this.devs.push(this.key());
  }
  key() {
    const b = new Uint8Array(32);
    for (let i = 0; i < 32; i++) b[i] = Math.floor(this.r() * 256);
    b[0] = 1 + b[0] % 250;
    return base58Encode(b);
  }
  slot(ts) {
    return this.slot0 + Math.floor((ts - this.opts.startTs) / 400);
  }
  /** Generate the full event stream in time order. */
  *run() {
    const end = this.opts.startTs + this.opts.durationMs;
    const step = this.opts.stepMs;
    const launchP = this.opts.launchesPerMin * step / 6e4;
    for (let ts = this.opts.startTs; ts < end; ts += step) {
      this.now = ts;
      const batch = [];
      let n2 = poisson(this.r, launchP);
      while (n2-- > 0) this.launch(ts + Math.floor(this.r() * step), batch);
      for (const t of this.active) if (!t.dead) this.stepToken(t, ts, step, batch);
      if (this.active.length > 400 || ts % 1e4 < step) {
        for (const t of this.active) if (t.dead) t.bags.clear();
        this.active = this.active.filter((t) => !t.dead);
      }
      batch.sort((a, b) => a.ts - b.ts);
      for (const ev of batch) yield ev;
    }
  }
  newName(ts) {
    this.recentNames = this.recentNames.filter((x) => ts - x.ts < 15 * 6e4);
    if (this.recentNames.length > 0 && this.r() < 0.22) {
      const c = pick(this.r, this.recentNames);
      return { name: c.name + (this.r() < 0.5 ? "" : " " + pick(this.r, ["2.0", "CTO", "official", "sol"])), symbol: c.symbol };
    }
    const w1 = pick(this.r, WORDS);
    const w2 = this.r() < 0.5 ? pick(this.r, WORDS) : "";
    const name = (w1[0].toUpperCase() + w1.slice(1) + (w2 ? " " + w2 : "")).slice(0, 30);
    const symbol = (w1 + (w2 ? w2.slice(0, 3) : "")).toUpperCase().slice(0, 10);
    return { name, symbol };
  }
  launch(ts, out) {
    const r = this.r;
    const { name, symbol } = this.newName(ts);
    const q = Math.min(40, lognormal(r, -2.4, 1.45));
    const pr = this.opts.predictability;
    const noise = Math.min(40, lognormal(r, -2.4, 1.45));
    const qEarly = pr * q + (1 - pr) * noise;
    const serial = r() < 0.25;
    const creator = serial ? this.devs[Math.floor(r() * 20)] : pick(r, this.devs);
    const devType = r() < (serial ? 0.7 : 0.35) ? "rug" : r() < 0.5 ? "slow" : "honest";
    const t = {
      mint: this.key(),
      name,
      symbol,
      creator,
      bondingCurve: this.key(),
      createdAt: ts,
      q,
      qEarly,
      devType,
      devSellAt: ts + (devType === "rug" ? 2e4 + r() * 3e5 : 6e5 + r() * 36e5),
      curve: newCurve(),
      stage: "curve",
      bags: /* @__PURE__ */ new Map(),
      excitation: 0,
      peakMcap: 28,
      dead: false,
      smartChecked: false,
      lastTradeAt: ts
    };
    this.launchedCount++;
    this.active.push(t);
    this.recentNames.push({ ts, name, symbol });
    this.truth.set(t.mint, { mint: t.mint, q, qEarly, devType, graduated: false, peakMcapSol: 28 });
    const slot = this.slot(ts);
    out.push({
      k: "create",
      ts,
      slot,
      sig: this.key(),
      src: "sim",
      chainTs: Math.floor(ts / 1e3),
      mint: t.mint,
      name,
      symbol,
      uri: `https://ipfs.io/ipfs/sim${t.mint.slice(0, 10)}`,
      creator,
      user: creator,
      vSol: CURVE.initialVirtualSol,
      vTok: CURVE.initialVirtualTok,
      realTok: CURVE.initialRealTok,
      supply: CURVE.supply
    });
    const devSol = r() < 0.15 ? 0 : Math.min(4, lognormal(r, -0.7, 0.8));
    if (devSol > 0.01) this.buy(t, creator, devSol, ts, slot, "dev", out);
    if (r() < (devType === "rug" ? 0.55 : 0.2)) {
      const n2 = 2 + Math.floor(r() * 8);
      for (let i = 0; i < n2; i++) this.buy(t, this.key(), 0.3 + r() * 2, ts, slot, "bundle", out);
    }
    const socialP = Math.min(0.9, 0.2 + 0.25 * qEarly);
    out.push({
      k: "meta",
      ts: ts + 800 + Math.floor(r() * 1500),
      mint: t.mint,
      src: "sim",
      twitter: r() < socialP ? r() < 0.4 ? `https://x.com/${symbol.toLowerCase()}/status/${18e17 + Math.floor(r() * 1e15)}` : `https://x.com/${symbol.toLowerCase()}` : void 0,
      telegram: r() < socialP * 0.6 ? `https://t.me/${symbol.toLowerCase()}` : void 0,
      website: r() < socialP * 0.4 ? `https://${symbol.toLowerCase()}.fun` : void 0,
      description: `${name} to the moon`
    });
  }
  mcap(t) {
    if (t.stage === "amm" && t.poolState) return t.poolState.quote * t.poolState.supply / t.poolState.base / LAMPORTS_PER_SOL;
    return curveMcapSol(t.curve);
  }
  priceOf(t) {
    if (t.stage === "amm" && t.poolState) return t.poolState.quote / t.poolState.base;
    return t.curve.vSol / t.curve.vTok;
  }
  stepToken(t, ts, step, out) {
    const r = this.r;
    const age = (ts - t.createdAt) / 1e3;
    const dt = step / 1e3;
    const qPhase = age < 90 ? t.qEarly : t.q;
    const life = 60 + 900 * Math.min(1, t.q / 4);
    let attention = qPhase * Math.exp(-age / life);
    if (t.stage === "amm") attention *= 0.6;
    t.excitation *= Math.pow(0.5, dt / 20);
    const buyRate = 0.9 * attention + t.excitation;
    const nBuys = Math.min(40, poisson(r, buyRate * dt));
    const slot = this.slot(ts);
    if (age < 1.2 && r() < 0.35) this.buy(t, this.key(), 0.2 + r() * 1.5, ts + Math.floor(r() * step), slot + 1, "sniper", out);
    for (let i = 0; i < nBuys; i++) {
      const size = Math.min(25, lognormal(r, -1.6, 1));
      this.buy(t, pick(r, this.retail), size, ts + Math.floor(r() * step), slot, "retail", out);
      t.excitation += 0.02;
    }
    if (!t.smartChecked && age > 8 && age < 60) {
      t.smartChecked = true;
      const pr = this.opts.predictability;
      const informed = Math.min(0.95, 0.03 + pr * 0.35 * Math.max(0, Math.log(t.q + 1)));
      const p = pr > 0 ? informed : 0.06;
      const k = poisson(r, p * 3);
      for (let i = 0; i < k; i++) this.buy(t, pick(r, this.smart), 0.5 + r() * 2.5, ts + Math.floor(r() * step), slot, "smart", out);
    }
    if (Math.floor(ts / 1e3) !== Math.floor((ts - step) / 1e3)) {
      const price = this.priceOf(t);
      const m = this.mcap(t);
      if (m > t.peakMcap) t.peakMcap = m;
      const dd = 1 - m / t.peakMcap;
      for (const [wallet, bag] of t.bags) {
        if (bag.tokens <= 0) continue;
        const mult = bag.costSol > 0 ? price * bag.tokens * 0.975 / (bag.costSol * LAMPORTS_PER_SOL) : 1;
        let hazard = 1 / 900;
        if (bag.kind === "sniper") hazard = mult > bag.target || age > 90 ? 0.3 : 1 / 120;
        else if (bag.kind === "bundle") hazard = mult > 1.4 || age > 120 ? 0.25 : 1 / 200;
        else if (bag.kind === "smart") hazard = mult > bag.target ? 0.2 : dd > 0.45 ? 0.08 : 1 / 1200;
        else if (bag.kind === "dev") {
          if (t.devType === "rug" && ts >= t.devSellAt) hazard = 1;
          else if (t.devType === "slow" && mult > 1.5) hazard = 1 / 60;
          else hazard = ts >= t.devSellAt ? 0.05 : 0;
        } else {
          hazard *= 1 + 2.5 * Math.max(0, mult - 1) + 6 * dd * dd;
          if (mult > bag.target) hazard += 0.05;
        }
        if (r() < 1 - Math.exp(-hazard)) {
          const frac = bag.kind === "dev" || bag.kind === "bundle" || r() < 0.6 ? 1 : 0.3 + r() * 0.5;
          this.sell(t, wallet, Math.floor(bag.tokens * frac), ts + Math.floor(r() * step), slot, out);
        }
      }
    }
    const idle = ts - t.lastTradeAt;
    if (buyRate < 0.01 && idle > 18e4 || idle > 18e5 || age > 6 * 3600) t.dead = true;
  }
  valueOf(t, tokens) {
    if (t.stage === "amm" && t.poolState) return poolSellQuote(t.poolState, tokens).solOut / LAMPORTS_PER_SOL;
    return curveSellQuote(t.curve, tokens).solOut / LAMPORTS_PER_SOL;
  }
  buy(t, wallet, sol2, ts, slot, kind, out) {
    const lamports = Math.floor(sol2 * LAMPORTS_PER_SOL);
    if (t.stage === "curve") {
      const q = curveBuyQuote(t.curve, lamports);
      if (q.tokensOut <= 0) return;
      t.curve = q.after;
      this.addBag(t, wallet, q.tokensOut, q.solSpent / LAMPORTS_PER_SOL, ts, kind);
      out.push({
        k: "trade",
        ts,
        slot,
        sig: this.key(),
        src: "sim",
        chainTs: Math.floor(ts / 1e3),
        mint: t.mint,
        buy: true,
        sol: q.solToCurve,
        tok: q.tokensOut,
        user: wallet,
        venue: "curve",
        vSol: t.curve.vSol,
        vTok: t.curve.vTok,
        realSol: t.curve.vSol - CURVE.initialVirtualSol,
        realTok: t.curve.realTok,
        supply: t.curve.supply,
        fee: q.feeLamports
      });
      t.lastTradeAt = ts;
      if (t.curve.realTok <= 0) this.graduate(t, ts, slot, out);
    } else if (t.poolState) {
      if (ts < (t.poolOpenAt ?? 0)) ts = t.poolOpenAt;
      const pre = { ...t.poolState };
      const q = poolBuyQuote(t.poolState, lamports);
      if (q.tokensOut <= 0) return;
      t.poolState = { ...t.poolState, base: q.after.vTok, quote: q.after.vSol };
      this.addBag(t, wallet, q.tokensOut, q.solSpent / LAMPORTS_PER_SOL, ts, kind);
      out.push({
        k: "ammSwap",
        ts,
        slot,
        sig: this.key(),
        src: "sim",
        chainTs: Math.floor(ts / 1e3),
        pool: t.pool,
        buy: true,
        base: q.tokensOut,
        quoteDelta: q.solToCurve,
        fee: q.feeLamports,
        user: wallet,
        poolBase: pre.base,
        poolQuote: pre.quote,
        virtualQuote: 0,
        supply: t.poolState.supply
      });
      t.lastTradeAt = ts;
    }
    const m = this.mcap(t);
    const tr = this.truth.get(t.mint);
    if (m > tr.peakMcapSol) tr.peakMcapSol = m;
  }
  addBag(t, wallet, tokens, costSol, ts, kind) {
    const b = t.bags.get(wallet);
    const r = this.r;
    const target = kind === "sniper" ? 1.5 + r() * 2 : kind === "smart" ? 2 + r() * 4 : kind === "retail" ? 1.5 + lognormal(r, 0, 0.8) : 99;
    if (b) {
      b.tokens += tokens;
      b.costSol += costSol;
    } else t.bags.set(wallet, { tokens, costSol, boughtAt: ts, kind, target });
  }
  sell(t, wallet, tokens, ts, slot, out) {
    const bag = t.bags.get(wallet);
    if (!bag || tokens <= 0) return;
    tokens = Math.min(tokens, bag.tokens);
    if (t.stage === "curve") {
      const q = curveSellQuote(t.curve, tokens);
      if (q.solFromCurve <= 0) return;
      t.curve = q.after;
      bag.costSol *= 1 - tokens / bag.tokens;
      bag.tokens -= tokens;
      out.push({
        k: "trade",
        ts,
        slot,
        sig: this.key(),
        src: "sim",
        chainTs: Math.floor(ts / 1e3),
        mint: t.mint,
        buy: false,
        sol: q.solFromCurve,
        tok: tokens,
        user: wallet,
        venue: "curve",
        vSol: t.curve.vSol,
        vTok: t.curve.vTok,
        realSol: t.curve.vSol - CURVE.initialVirtualSol,
        realTok: t.curve.realTok,
        supply: t.curve.supply,
        fee: q.feeLamports
      });
    } else if (t.poolState) {
      if (ts < (t.poolOpenAt ?? 0)) ts = t.poolOpenAt;
      const pre = { ...t.poolState };
      const q = poolSellQuote(t.poolState, tokens);
      if (q.solOut <= 0) return;
      t.poolState = { ...t.poolState, base: q.after.vTok, quote: q.after.vSol };
      bag.costSol *= 1 - tokens / bag.tokens;
      bag.tokens -= tokens;
      out.push({
        k: "ammSwap",
        ts,
        slot,
        sig: this.key(),
        src: "sim",
        chainTs: Math.floor(ts / 1e3),
        pool: t.pool,
        buy: false,
        base: tokens,
        quoteDelta: q.solFromCurve,
        fee: q.feeLamports,
        user: wallet,
        poolBase: pre.base,
        poolQuote: pre.quote,
        virtualQuote: 0,
        supply: t.poolState.supply
      });
    }
    if (bag.tokens <= 0) t.bags.delete(wallet);
    t.lastTradeAt = ts;
  }
  graduate(t, ts, slot, out) {
    t.stage = "amm";
    t.pool = this.key();
    const realSol = t.curve.vSol - CURVE.initialVirtualSol;
    const quote = Math.max(1, realSol - 15000001);
    const base = CURVE.supply - CURVE.initialRealTok;
    t.poolState = { base, quote, supply: CURVE.supply, hasCreator: true };
    const tr = this.truth.get(t.mint);
    tr.graduated = true;
    t.excitation += 0.6;
    out.push({ k: "complete", ts: ts + 1, slot, sig: this.key(), src: "sim", mint: t.mint });
    out.push({ k: "migrate", ts: ts + 2, slot, sig: this.key(), src: "sim", mint: t.mint, pool: t.pool, solAmount: quote, mintAmount: base });
    out.push({ k: "pool", ts: ts + 2, slot, sig: this.key(), src: "sim", pool: t.pool, mint: t.mint, quoteIsSol: true, base, quote, coinCreator: t.creator });
    t.poolOpenAt = ts + 3;
  }
  get launched() {
    return this.launchedCount;
  }
};

// src/node/feeds/sim.ts
var SimFeed = class {
  constructor(o) {
    this.o = o;
  }
  timer = null;
  h = { name: "simulator", status: "off", lastMsgAt: 0, msgs: 0, reconnects: 0, errors: 0, critical: true, note: "SIMULATED MARKET \u2014 not real coins" };
  start() {
    const speed = Math.max(0.1, this.o.speed);
    let seed = this.o.seed ?? Math.floor(Math.random() * 1e9);
    const startReal = Date.now();
    const newSim = (from) => new MarketSim({ seed: seed++, startTs: from, durationMs: 24 * 36e5, predictability: this.o.predictability, launchesPerMin: 6 });
    let sim = newSim(startReal);
    let gen = sim.run();
    let pending = null;
    this.h.status = "open";
    this.o.log.warn("SIMULATOR feed running \u2014 events are synthetic, not real coins");
    this.timer = setInterval(() => {
      const virtualNow = startReal + (Date.now() - startReal) * speed;
      for (let i = 0; i < 2e4; i++) {
        if (!pending) {
          const n2 = gen.next();
          if (n2.done) {
            sim = newSim(virtualNow);
            gen = sim.run();
            continue;
          }
          pending = n2.value;
        }
        if (pending.ts > virtualNow) break;
        const realTs = startReal + (pending.ts - startReal) / speed;
        this.o.onEvent({ ...pending, ts: Math.round(realTs) });
        this.h.msgs++;
        this.h.lastMsgAt = Date.now();
        pending = null;
      }
      this.o.onHealth({ ...this.h });
    }, 100);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.h.status = "off";
  }
};

// src/node/feeds/solprice.ts
var WSOL2 = "So11111111111111111111111111111111111111112";
async function fetchSolUsd() {
  const jup = await getJson(`https://lite-api.jup.ag/price/v3?ids=${WSOL2}`, { timeoutMs: 5e3 });
  const a = jup?.[WSOL2]?.usdPrice;
  if (a && a > 1) return a;
  const cb = await getJson("https://api.coinbase.com/v2/prices/SOL-USD/spot", { timeoutMs: 5e3 });
  const b = Number(cb?.data?.amount);
  if (b > 1) return b;
  const kr = await getJson("https://api.kraken.com/0/public/Ticker?pair=SOLUSD", { timeoutMs: 5e3 });
  const c = Number(Object.values(kr?.result ?? {})[0]?.c?.[0]);
  if (c > 1) return c;
  return null;
}
var SolPrice = class {
  constructor(log, onPrice) {
    this.log = log;
    this.onPrice = onPrice;
  }
  value = 0;
  updatedAt = 0;
  timer = null;
  start() {
    const tick = async () => {
      const v = await fetchSolUsd();
      if (v) {
        this.value = v;
        this.updatedAt = Date.now();
        this.onPrice(v);
      } else if (Date.now() - this.updatedAt > 10 * 6e4) this.log.warn("SOL/USD price unavailable (showing SOL values only)");
    };
    void tick();
    this.timer = setInterval(() => void tick(), 3e4);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }
};

// src/core/autopilot.ts
var HOUR2 = 36e5;
var AUTOPILOT = {
  /** an edge-finder answer older than this switches nothing */
  freshMs: 6 * HOUR2,
  /** a new rule replaces one that still holds up only when it earns this much more per day */
  better: 1.25,
  /** real money: the go-live bar */
  liveMinTrades: 100,
  liveMinLo: 0.02,
  /** the search is trusted only while it "finds" at most this many rules per run on shuffled data (1 in 5 runs) */
  maxPlacebo: 0.2,
  /** trades of the rule in use before its own results are judged */
  checkAfter: 30,
  /** coins that qualified after it was proven, before its forward test is judged */
  forwardMin: 40,
  /** trades of the user's own rule before its track record counts against a proven rule */
  trackMin: 30,
  benchMs: 24 * HOUR2
};
function emptyAutopilot() {
  return { active: null, since: 0, proof: null, own: null, holding: false, holdReason: "", benched: {}, log: [], rule: null, proofTo: 0 };
}
function capacityPerDay(rule, s) {
  const holdMin = Math.max(1, rule.avgHoldMin ?? (rule.hold || 60));
  return Math.min(s.maxTradesPerHour * 24, s.maxOpen * 1440 / holdMin);
}
function worstPerDay(rule, s) {
  return Math.max(0, rule.holdout.lo) * Math.min(rule.tradesPerDay, capacityPerDay(rule, s));
}
function trackRecord(s, closed, now) {
  const key = ruleKey(s);
  const from = now - 3 * 24 * HOUR2;
  const mine = closed.filter((p) => p.status === "closed" && p.mode === s.mode && p.rule === key && p.openedAt >= from && Number.isFinite(p.pnlPct));
  if (mine.length < AUTOPILOT.trackMin) return null;
  const m = clusteredMeanCI(
    mine.map((p) => (p.pnlPct ?? 0) / 100),
    mine.map((p) => hourOf(p.openedAt))
  );
  const first = Math.min(...mine.map((p) => p.openedAt));
  const perDay = mine.length / Math.max(1 / 24, (now - first) / (24 * HOUR2));
  return { n: mine.length, mean: m.mean, lo: m.lo, perDay, v: Math.max(0, m.lo) * perDay };
}
var pct2 = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
function ownEvidence(s, closed, now, measured) {
  const track = trackRecord(s, closed, now);
  if (track) return { v: track.v, n: track.n, mean: track.mean, lo: track.lo, perDay: track.perDay, from: "trades" };
  const m = measured;
  if (!m || !m.ok || m.key !== ruleKey(s) || now - m.at > AUTOPILOT.freshMs) return null;
  const perDay = Math.min(m.coinsPerDay, capacityPerDay({ avgHoldMin: m.avgHoldMin, hold: s.maxHoldMin }, s));
  return { v: Math.max(0, m.lo) * perDay, n: m.n, mean: m.mean, lo: m.lo, perDay, from: "recordings" };
}
function ownWords(own) {
  return own.from === "trades" ? `its ${own.n} trades made ${pct2(own.mean)} each (at least ${pct2(own.lo)}), about ${own.perDay.toFixed(0)} a day` : `on the newest recordings, the part the search checks its candidates on, it made ${pct2(own.mean)} per trade on ${own.n} coins (at least ${pct2(own.lo)}), about ${own.perDay.toFixed(0)} trades a day at your limits`;
}
var logged = (r) => ({ text: r.text, settings: r.settings });
function evidenceOf(report, now) {
  const fresh = !!report && report.status === "ok" && report.method === EDGE_METHOD && now - report.generatedAt <= AUTOPILOT.freshMs;
  return { fresh, trusted: fresh && report.placebo.avgSurvivors <= AUTOPILOT.maxPlacebo };
}
function whyNone(report, fresh, trusted, live, hadSurvivors) {
  if (!report || report.status !== "ok") return "the edge finder has no answer yet (it needs about a day of recorded market)";
  if (report.method !== EDGE_METHOD) return "the edge finder's last answer was made by an older version of the bot; the next search replaces it (the first runs 20 minutes after the bot starts)";
  if (!fresh) return "the edge finder's last answer is more than 6 hours old";
  if (!trusted) return `the edge finder's luck check "found" ${report.placebo.avgSurvivors.toFixed(1)} rules per run on shuffled data, so its answers are not trusted right now`;
  if (!hadSurvivors) return "no rule held up on data the search never saw";
  return live ? `no rule meets the bar for real money (at least ${AUTOPILOT.liveMinTrades} unseen trades and a worst case above +${AUTOPILOT.liveMinLo * 100}% per trade)` : "no rule held up that is not benched";
}
function decideAutopilot(o) {
  const s = o.settings;
  const now = o.now;
  const st = { ...o.state, benched: { ...o.state.benched }, log: [...o.state.log] };
  const notes = [];
  const named = [];
  const done = (action, extra = {}) => {
    const note = notes.join(" ");
    if (note) st.log = [...st.log, { at: now, what: note, ...named.length ? { rules: named } : {} }].slice(-30);
    return { action, note, state: st, ...extra };
  };
  for (const [k, until] of Object.entries(st.benched)) if (until <= now) delete st.benched[k];
  if (!s.autopilot) {
    const wasHolding = st.holding;
    Object.assign(st, { active: null, proof: null, own: null, holding: false, holdReason: "" });
    if (wasHolding) notes.push("Autopilot is off: live entries are no longer held.");
    return done(wasHolding ? "release" : "none");
  }
  const live = s.mode === "live";
  if (!live && st.holding) {
    Object.assign(st, { holding: false, holdReason: "" });
    notes.push("Paper mode: new entries are no longer held.");
  }
  let benchedNow = false;
  if (st.active && st.proof) {
    const mine = o.closed.filter((p) => p.status === "closed" && p.mode === s.mode && p.openedAt >= st.since && Number.isFinite(p.pnlPct));
    if (mine.length >= AUTOPILOT.checkAfter) {
      const m = meanCI(mine.map((p) => (p.pnlPct ?? 0) / 100));
      if (m.hi < st.proof.lo) {
        st.benched[st.active] = now + AUTOPILOT.benchMs;
        notes.push(`Dropped "${st.active}": its ${mine.length} trades averaged ${pct2(m.mean)}, below the ${pct2(st.proof.lo)} worst case it had shown on unseen data. Benched for a day.`);
        if (st.rule) named.push(logged(st.rule));
        benchedNow = true;
      }
    }
  }
  const report = o.report;
  const fwd = o.forward ?? report?.incumbent;
  if (st.active && st.proof && !benchedNow && fwd?.text === st.active && fwd.n >= AUTOPILOT.forwardMin && fwd.hi < st.proof.lo) {
    st.benched[st.active] = now + AUTOPILOT.benchMs;
    notes.push(`Dropped "${st.active}": on ${fwd.n} coins that qualified after it was proven it averaged ${pct2(fwd.mean)}, below the ${pct2(st.proof.lo)} worst case it had shown. Benched for a day.`);
    if (st.rule) named.push(logged(st.rule));
    benchedNow = true;
  }
  const { fresh, trusted } = evidenceOf(report, now);
  const passes = (r) => r.holdout.lo > 0 && (!live || r.holdout.n >= AUTOPILOT.liveMinTrades && r.holdout.lo > AUTOPILOT.liveMinLo);
  const ranked = [...trusted ? report.survivors : [], ...o.extra ?? []].filter((r) => passes(r) && !((st.benched[r.text] ?? 0) > now)).map((r) => ({ r, v: worstPerDay(r, s) })).sort((a, b) => b.v - a.v);
  const best = ranked[0];
  const liveGrade = (p) => !!p && p.n >= AUTOPILOT.liveMinTrades && p.lo > AUTOPILOT.liveMinLo;
  const stands = !!st.active && !benchedNow && (!live || liveGrade(st.proof));
  if (stands) {
    const listed = ranked.find((x) => x.r.text === st.active);
    const curV = listed?.v ?? (st.rule ? worstPerDay(st.rule, s) : 0);
    if (!best || best.r.text === st.active || best.v < curV * AUTOPILOT.better) {
      if (st.holding) Object.assign(st, { holding: false, holdReason: "" });
      return done("none");
    }
  }
  const own = st.active === null && !live ? ownEvidence(s, o.closed, now, o.measured) : null;
  if (best && !stands && st.active === null && !live) {
    if (o.measuring) return done("none");
    if (own && best.v < own.v * AUTOPILOT.better) {
      if (st.keptOwnOver !== best.r.text) {
        st.keptOwnOver = best.r.text;
        named.push(logged(best.r));
        notes.push(
          `Kept your own rule: ${ownWords(own)} \u2014 at your size at least ~${(own.v * s.positionSol).toFixed(2)} SOL a day, more than the best proven rule ("${best.r.text}", at least ~${(best.v * s.positionSol).toFixed(2)} SOL a day) would add.`
        );
      }
      return done("none");
    }
  }
  if (best) {
    const fromOwn = st.active === null && !st.holding;
    if (fromOwn && !st.own) st.own = ruleOf(s);
    const was = stands ? st.active : null;
    Object.assign(st, {
      active: best.r.text,
      since: now,
      proof: { mean: best.r.holdout.mean, lo: best.r.holdout.lo, n: best.r.holdout.n },
      rule: best.r,
      proofTo: best.r.cond === "lab" ? now : report?.cutoff ?? report?.generatedAt ?? now,
      holding: false,
      holdReason: ""
    });
    const sol2 = best.v * s.positionSol;
    const yours = !fromOwn || live ? "" : own ? ` Your own rule (${ruleSummary(s)}): ${ownWords(own)} \u2014 at least ~${(own.v * s.positionSol).toFixed(2)} SOL a day.` : ` Your own rule (${ruleSummary(s)}) has nothing to show yet: ${o.measured?.key === ruleKey(s) && o.measured.why ? `${o.measured.why}, and ` : ""}it has fewer than ${AUTOPILOT.trackMin} trades of its own.`;
    named.push(logged(best.r));
    if (fromOwn && !live) named.push({ text: `your own rule (${ruleSummary(s)})`, settings: ruleOf(s) });
    notes.push(
      `Now trading: ${best.r.text}. On ${best.r.holdout.n} ${best.r.cond === "lab" ? "coins that came after the Lab invented it" : "trades the search never saw"} it made ${pct2(best.r.holdout.mean)} per trade (worst case ${pct2(best.r.holdout.lo)}), about ${best.r.tradesPerDay.toFixed(0)} coins a day; at your size and limits that is at least ~${sol2.toFixed(2)} SOL a day on that data${was ? `, more than "${was}"` : ""}. Past results can stop working: it is checked against its own trades and the coins after it.${yours}`
    );
    return done("switch", { rule: best.r, settings: best.r.settings });
  }
  const why = whyNone(report, fresh, trusted, live, (report?.survivors.length ?? 0) + (o.extra?.length ?? 0) > 0);
  if (live) {
    if (st.holding && !st.active) {
      st.holdReason = why;
      return done("none");
    }
    Object.assign(st, { active: null, proof: null, rule: null, holding: true, holdReason: why });
    notes.push(`Holding new live entries: ${why}. Open positions are still managed.`);
    return done("hold");
  }
  if (st.active && benchedNow) {
    const saved = st.own;
    Object.assign(st, { active: null, proof: null, rule: null, own: null });
    const back = saved ? { conds: [], ...saved } : null;
    notes.push(back ? `Back to your own rule (${ruleSummary({ ...s, ...back })}): ${why}.` : `No proven rule: ${why}.`);
    if (back) named.push({ text: `your own rule (${ruleSummary({ ...s, ...back })})`, settings: back });
    return done("restore", back ? { settings: back } : {});
  }
  return done("none");
}
function pickRule(o) {
  const s = o.settings;
  const now = o.now;
  const st = { ...o.state, benched: { ...o.state.benched }, log: [...o.state.log], keptOwnOver: void 0, pickedAt: now };
  const { trusted } = evidenceOf(o.report, now);
  const proven = [...trusted ? o.report.survivors : [], ...o.extra ?? []].find((r) => !((st.benched[r.text] ?? 0) > now) && followsPreset(s, r.settings));
  const note = (what, rules) => {
    st.log = [...st.log, { at: now, what, rules }].slice(-30);
    return st;
  };
  if (proven) {
    if (st.active === null && !st.own) st.own = ruleOf(o.prev);
    Object.assign(st, {
      active: proven.text,
      since: now,
      proof: { mean: proven.holdout.mean, lo: proven.holdout.lo, n: proven.holdout.n },
      rule: proven,
      proofTo: proven.cond === "lab" ? now : o.report?.cutoff ?? o.report?.generatedAt ?? now
    });
    return note(`You picked "${proven.text}", a rule proven on data the search never saw: the autopilot trades it and judges it like its own picks \u2014 on its own trades and on the coins after its proof.`, [logged(proven)]);
  }
  Object.assign(st, { active: null, proof: null, rule: null, own: null });
  return note(
    `You picked your own rule: ${ruleSummary(s)}. The autopilot stays on and keeps it unless a proven rule does clearly better (${Math.round((AUTOPILOT.better - 1) * 100)}% more a day at its worst case) \u2014 judged on its own trades once it has ${AUTOPILOT.trackMin}, until then on the newest recordings with the same bar as the proven rules.`,
    [{ text: `your own rule (${ruleSummary(s)})`, settings: ruleOf(s) }]
  );
}
function rulesInWords(what, horizonMs) {
  const out = [];
  const add = (text) => {
    const r = edgeRuleFromText(text);
    if (r && !out.some((x) => x.text === text)) out.push({ text, settings: settingsFor(r, horizonMs) });
  };
  for (const m of what.matchAll(/Dropped "([^"]+)"/g)) add(m[1]);
  for (const m of what.matchAll(/Now trading: (Buy .+?)\. On \d/g)) add(m[1]);
  for (const m of what.matchAll(/best proven rule \("([^"]+)"/g)) add(m[1]);
  return out;
}
function autopilotView(o) {
  const s = o.settings;
  const report = o.report;
  const live = s.mode === "live";
  const { trusted } = evidenceOf(report, o.now);
  const ranking = [...report?.status === "ok" ? report.survivors : [], ...o.extra ?? []].map((r) => ({
    text: r.text,
    settings: r.settings,
    inUse: followsPreset(s, r.settings),
    perTrade: r.holdout.mean,
    worstPerTrade: r.holdout.lo,
    unseenTrades: r.holdout.n,
    coinsPerDay: r.tradesPerDay,
    tradesPerDay: Math.min(r.tradesPerDay, capacityPerDay(r, s)),
    worstSolPerDay: worstPerDay(r, s) * s.positionSol,
    liveGrade: r.holdout.n >= AUTOPILOT.liveMinTrades && r.holdout.lo > AUTOPILOT.liveMinLo,
    benchedUntil: o.state.benched[r.text] ?? 0,
    active: r.text === o.state.active
  })).sort((a, b) => b.worstSolPerDay - a.worstSolPerDay);
  const inc = o.forward ?? report?.incumbent;
  const fwd = inc && inc.text === o.state.active ? inc : null;
  const ev = o.state.active === null ? ownEvidence(s, o.closed ?? [], o.now, o.measured) : null;
  const m = o.measured && o.measured.key === ruleKey(s) ? o.measured : null;
  const own = o.state.active !== null ? null : o.measuring ? { measuring: true } : ev ? { from: ev.from, n: ev.n, mean: ev.mean, lo: ev.lo, perDay: ev.perDay, worstSolPerDay: ev.v * s.positionSol } : { why: m?.why ?? (m ? "its measure is out of date; the next search measures it again" : "it is measured at the next search (every 2 hours)") };
  const horizonMs = o.horizonMs ?? 6 * HOUR2;
  return {
    on: s.autopilot,
    live,
    active: o.state.active,
    since: o.state.since,
    proof: o.state.proof,
    /** the latest search listed the rule in use again */
    relisted: !!o.state.active && ranking.some((r) => r.active),
    /** the rule in use on coins that qualified after its proof */
    forward: fwd && fwd.n > 0 ? { n: fwd.n, mean: fwd.mean, lo: fwd.lo, hi: fwd.hi } : null,
    holding: o.state.holding,
    holdReason: o.state.holdReason,
    rule: ruleSummary(s),
    reportAt: report?.generatedAt ?? 0,
    trusted,
    ranking: ranking.slice(0, 8),
    /** your own rule's evidence while it is in use (ownEvidence), or why there is none yet */
    own,
    log: o.state.log.slice(-12).reverse().map((x) => ({ at: x.at, what: x.what, rules: (x.rules ?? rulesInWords(x.what, horizonMs)).map((r) => ({ ...r, inUse: followsPreset(s, r.settings) })) }))
  };
}

// src/core/learn.ts
var SAME_MOMENT_MS = 3e3;
function labelOf(s, target) {
  const gi = GRID.findIndex((g) => g.tp === target.tpPct && g.sl === target.slPct);
  if (gi >= 0 && s.gv === GRID_VERSION && s.grid?.length === GRID.length) {
    if (!comboCounts(s, gi)) return null;
    const r = s.grid[gi];
    return Number.isFinite(r) ? r > 0 ? 1 : 0 : null;
  }
  if (s.blind !== void 0 || s.ov === void 0 && s.stage === "amm") return null;
  if (s.tp === target.tpPct && s.sl === target.slPct && Number.isFinite(s.ret)) return s.ret > 0 ? 1 : 0;
  return null;
}
function trainingRows(samples, target, opts = {}) {
  const d = FEATURE_KEYS.length;
  let cutoff = Infinity;
  if (opts.horizonMs && opts.horizonMs > 0) {
    let last = 0;
    for (const s of samples) if (s.resolvedAt > last) last = s.resolvedAt;
    cutoff = last - opts.horizonMs;
  }
  const list = samples.filter((s) => (s.kind === "checkpoint" || s.kind === "entry") && s.x?.length === d && s.ts <= cutoff).sort((a, b) => a.ts - b.ts);
  const lastKept = /* @__PURE__ */ new Map();
  const out = [];
  for (const s of list) {
    const y = labelOf(s, target);
    if (y === null) continue;
    const prev = lastKept.get(s.mint);
    if (prev !== void 0 && s.ts - prev < SAME_MOMENT_MS) continue;
    lastKept.set(s.mint, s.ts);
    out.push({ ts: s.ts, stage: s.stage, x: s.x, y, mint: s.mint, kind: s.kind === "entry" ? "entry" : "checkpoint" });
  }
  return out;
}
function auc(scores, labels) {
  const idx = Array.from({ length: scores.length }, (_, i2) => i2).sort((a, b) => scores[a] - scores[b]);
  let rankSum = 0;
  let nPos = 0;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++)
      if (labels[idx[k]] === 1) {
        rankSum += avgRank;
        nPos++;
      }
    i = j + 1;
  }
  const nNeg = labels.length - nPos;
  if (nPos === 0 || nNeg === 0) return NaN;
  return (rankSum - nPos * (nPos + 1) / 2) / (nPos * nNeg);
}
function* evaluateSteps(stage, rows) {
  return (yield* scoreRowsSteps(stage, rows)).metrics;
}
function* scoreRowsSteps(stage, rows) {
  const n2 = rows.length;
  const ps = new Float64Array(n2);
  const ys = new Uint8Array(n2);
  const losses = new Float64Array(n2);
  let ll = 0;
  let br = 0;
  let pos = 0;
  for (let i = 0; i < n2; i++) {
    const r = rows[i];
    const p = clamp(sigmoid(stageLogit(stage, r.x)), 1e-6, 1 - 1e-6);
    ps[i] = p;
    ys[i] = r.y;
    losses[i] = -(r.y * Math.log(p) + (1 - r.y) * Math.log(1 - p));
    ll += losses[i];
    br += (p - r.y) ** 2;
    pos += r.y;
    if ((i & 2047) === 2047) yield;
  }
  return { metrics: { n: n2, positives: pos, auc: auc(ps, ys), logLoss: n2 ? ll / n2 : NaN, brier: n2 ? br / n2 : NaN, baseRate: n2 ? pos / n2 : NaN }, losses };
}
function lossGainZ(a, b, rows) {
  const n2 = rows.length;
  if (!n2) return { gain: NaN, z: 0 };
  const byCoin = /* @__PURE__ */ new Map();
  let total = 0;
  for (let i = 0; i < n2; i++) {
    const d = a[i] - b[i];
    total += d;
    const key = rows[i].mint ?? `row:${i}`;
    const c = byCoin.get(key);
    if (c) {
      c.d += d;
      c.n++;
    } else byCoin.set(key, { d, n: 1 });
  }
  const gain = total / n2;
  let v = 0;
  for (const c of byCoin.values()) v += (c.d - gain * c.n) ** 2;
  const k = byCoin.size;
  const se = k > 1 ? Math.sqrt(v * (k / (k - 1))) / n2 : Infinity;
  return { gain, z: se > 0 ? gain / se : gain > 0 ? Infinity : 0 };
}
function choleskyFlat(A, b, n2) {
  const L = new Float64Array(n2 * n2);
  for (let i = 0; i < n2; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n2 + j];
      for (let k = 0; k < j; k++) s -= L[i * n2 + k] * L[j * n2 + k];
      if (i === j) {
        if (s <= 1e-12) return null;
        L[i * n2 + i] = Math.sqrt(s);
      } else L[i * n2 + j] = s / L[j * n2 + j];
    }
  }
  const y = new Float64Array(n2);
  for (let i = 0; i < n2; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n2 + k] * y[k];
    y[i] = s / L[i * n2 + i];
  }
  const x = new Float64Array(n2);
  for (let i = n2 - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n2; k++) s -= L[k * n2 + i] * x[k];
    x[i] = s / L[i * n2 + i];
  }
  return x;
}
function* newtonSteps(Z, n2, k, y, w, prior, lambda, maxIter = 30) {
  const d = k + 1;
  let beta = Float64Array.from(prior);
  const objective = (b) => {
    let f2 = 0;
    for (let i = 0; i < n2; i++) {
      let s = b[0];
      const o = i * k;
      for (let j = 0; j < k; j++) s += b[j + 1] * Z[o + j];
      const p = clamp(sigmoid(s), 1e-9, 1 - 1e-9);
      f2 -= w[i] * (y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p));
    }
    for (let j = 1; j < d; j++) f2 += 0.5 * lambda * (b[j] - prior[j]) ** 2;
    f2 += 0.5 * 1e-4 * (b[0] - prior[0]) ** 2;
    return f2;
  };
  let fPrev = objective(beta);
  let converged = false;
  const g = new Float64Array(d);
  const H2 = new Float64Array(d * d);
  for (let iter = 0; iter < maxIter; iter++) {
    g.fill(0);
    H2.fill(0);
    for (let i = 0; i < n2; i++) {
      const o = i * k;
      let s = beta[0];
      for (let j = 0; j < k; j++) s += beta[j + 1] * Z[o + j];
      const p = sigmoid(s);
      const r = w[i] * (p - y[i]);
      const v = w[i] * Math.max(p * (1 - p), 1e-9);
      g[0] += r;
      H2[0] += v;
      for (let j = 0; j < k; j++) {
        const zj = Z[o + j];
        g[j + 1] += r * zj;
        H2[j + 1] += v * zj;
        const vz = v * zj;
        const row = (j + 1) * d + 1;
        for (let m = 0; m <= j; m++) H2[row + m] += vz * Z[o + m];
      }
      if ((i & 4095) === 4095) yield;
    }
    for (let j = 1; j < d; j++) {
      g[j] += lambda * (beta[j] - prior[j]);
      H2[j * d + j] += lambda;
      H2[j * d] = H2[j];
      for (let m = 1; m < j; m++) H2[m * d + j] = H2[j * d + m];
    }
    g[0] += 1e-4 * (beta[0] - prior[0]);
    H2[0] += 1e-4;
    const step = choleskyFlat(H2, g, d);
    if (!step) break;
    let t = 1;
    let next = beta;
    let fNext = fPrev;
    for (let h = 0; h < 20; h++) {
      next = beta.map((b, j) => b - t * step[j]);
      fNext = objective(next);
      if (fNext <= fPrev + 1e-12) break;
      t /= 2;
    }
    let moved = 0;
    for (let j = 0; j < d; j++) moved = Math.max(moved, Math.abs(step[j] * t));
    beta = next;
    const improvement = fPrev - fNext;
    fPrev = fNext;
    yield;
    if (moved < 1e-7 || improvement < 1e-9) {
      converged = true;
      break;
    }
  }
  return { beta: Array.from(beta), converged };
}
var REDUNDANT = { curve: ["progress", "liquidity", "sinceMig"], amm: ["progress"] };
function* fitStageSteps(base, rows, weights, opts = {}) {
  const lambda = opts.lambda ?? 8;
  const half = opts.standardizeHalfRows ?? 400;
  const n2 = rows.length;
  const d = FEATURE_KEYS.length;
  const blend = n2 / (n2 + half);
  let sw = 0;
  for (let i = 0; i < n2; i++) sw += weights[i];
  const mean2 = {};
  const std = {};
  for (let j = 0; j < d; j++) {
    const k = FEATURE_KEYS[j];
    let m = 0;
    for (let i = 0; i < n2; i++) m += weights[i] * rows[i].x[j];
    m /= sw || 1;
    let v = 0;
    for (let i = 0; i < n2; i++) v += weights[i] * (rows[i].x[j] - m) ** 2;
    v /= sw || 1;
    const pm = base.mean[k] ?? 0;
    const ps = base.std[k] ?? 1;
    mean2[k] = (1 - blend) * pm + blend * m;
    const sd = (1 - blend) * ps + blend * Math.sqrt(v);
    std[k] = sd > 1e-6 ? sd : ps;
    if ((j & 3) === 3) yield;
  }
  const shape = { pRef: base.pRef, bias: 0, weights: {}, mean: mean2, std };
  const zero = new Set(opts.zero ?? []);
  const prior = [base.bias];
  FEATURE_KEYS.forEach((k) => prior.push(zero.has(k) ? 0 : (base.weights[k] ?? 0) * ((std[k] ?? 1) / (base.std[k] ?? 1))));
  let pos = 0;
  for (let i = 0; i < n2; i++) pos += weights[i] * rows[i].y;
  const baseRate = clamp(sw > 0 ? pos / sw : base.pRef, 5e-3, 0.95);
  prior[0] = logit(baseRate);
  const Z = new Float64Array(n2 * d);
  const y = new Uint8Array(n2);
  const zeroAt = FEATURE_KEYS.flatMap((k, j) => zero.has(k) ? [j] : []);
  for (let i = 0; i < n2; i++) {
    const r = rows[i];
    Z.set(standardize(shape, r.x), i * d);
    for (const j of zeroAt) Z[i * d + j] = 0;
    y[i] = r.y;
    if ((i & 4095) === 4095) yield;
  }
  yield;
  const { beta } = yield* newtonSteps(Z, n2, d, y, weights, prior, lambda);
  const out = {};
  FEATURE_KEYS.forEach((k, j) => out[k] = clamp(beta[j + 1], -10, 10));
  return { pRef: baseRate, bias: beta[0], weights: out, mean: mean2, std };
}
function* calibrateSteps(stage, rows) {
  if (rows.length < 50) return stage;
  const plain = { ...stage, calib: void 0 };
  const z = new Float64Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    z[i] = rawLogit(plain, rows[i].x);
    if ((i & 2047) === 2047) yield;
  }
  const { beta } = yield* newtonSteps(
    z,
    rows.length,
    1,
    rows.map((r) => r.y),
    rows.map((r) => r.w ?? 1),
    [0, 1],
    0.5
  );
  if (!(beta[1] > 0.05)) return stage;
  return { ...stage, calib: { a: beta[0], b: beta[1] } };
}
var TRAIN_DEFAULTS = {
  minRows: 300,
  minPositives: 25,
  halfLifeDays: 3,
  trees: true,
  treesMinRows: 2e3,
  minFreshRows: 200,
  minFreshPositives: 10,
  treesZ: 1.65,
  replaceZ: 1.5,
  replaceMinGain: 1e-3
};
var EMPTY = { n: 0, positives: 0, auc: NaN, logLoss: NaN, brier: NaN, baseRate: NaN };
function* boostDataSteps(rows, w, lin) {
  const n2 = rows.length;
  const d = FEATURE_KEYS.length;
  const X = new Float32Array(n2 * d);
  const y = new Uint8Array(n2);
  const wf = new Float32Array(n2);
  const base = new Float64Array(n2);
  for (let i = 0; i < n2; i++) {
    const r = rows[i];
    for (let j = 0; j < d; j++) X[i * d + j] = r.x[j];
    y[i] = r.y;
    wf[i] = w[i];
    base[i] = linear(lin, standardize(lin, r.x));
    if ((i & 4095) === 4095) yield;
  }
  return { n: n2, d, X, y, w: wf, base };
}
function* scaleSteps(stage, rows) {
  const pop = rows.filter((r) => r.kind !== "entry");
  const use = pop.length >= 100 ? pop : rows;
  const L = new Float64Array(use.length);
  for (let i = 0; i < use.length; i++) {
    L[i] = stageLogit(stage, use[i].x);
    if ((i & 2047) === 2047) yield;
  }
  L.sort();
  const q = (f2) => L[Math.min(L.length - 1, Math.round(f2 * (L.length - 1)))];
  const at50 = q(0.5);
  const at75 = q(0.95);
  return use.length >= 50 && at75 - at50 > 0.05 ? { at50, at75 } : void 0;
}
function populationRate(rows, w) {
  let pos = 0;
  let sw = 0;
  rows.forEach((r, i) => {
    if (r.kind === "entry") return;
    pos += w[i] * r.y;
    sw += w[i];
  });
  let count = 0;
  for (const r of rows) if (r.kind !== "entry") count++;
  return count >= 100 && sw > 0 ? clamp(pos / sw, 5e-3, 0.95) : null;
}
function* stageSteps(stageKey, cur, seenTo2, input, o) {
  const n2 = input.length;
  const coinIds = /* @__PURE__ */ new Map();
  const coin = new Int32Array(n2);
  input.forEach((r, i) => {
    const k = r.mint ?? `row:${i}`;
    let id = coinIds.get(k);
    if (id === void 0) coinIds.set(k, id = coinIds.size);
    coin[i] = id;
  });
  const first = new Float64Array(coinIds.size).fill(Infinity);
  input.forEach((r, i) => {
    if (r.ts < first[coin[i]]) first[coin[i]] = r.ts;
  });
  yield;
  const order = Array.from({ length: n2 }, (_, i) => i).sort((a, b) => first[coin[a]] - first[coin[b]] || coin[a] - coin[b] || input[a].ts - input[b].ts);
  yield;
  const sr = order.map((i) => input[i]);
  const keys = order.map((i) => coin[i]);
  const cutAt = (frac, hi) => {
    let c = Math.floor(hi * frac);
    while (c > 0 && c < hi && keys[c] === keys[c - 1]) c++;
    return c;
  };
  const cut = cutAt(0.75, n2);
  const train = sr.slice(0, cut);
  const val = sr.slice(cut);
  const cutA = cutAt(0.8, cut);
  const partA = sr.slice(0, cutA);
  const partB = sr.slice(cutA, cut);
  const pos = sr.reduce((s, r) => s + r.y, 0);
  const entries = sr.filter((r) => r.kind === "entry").length;
  const rows = { total: n2, entries };
  const base = { stage: stageKey, trainRows: train.length, valRows: val.length, entryRows: entries };
  if (n2 < o.minRows || pos < o.minPositives || val.length < 50 || partB.length < 30) {
    return {
      rows,
      report: {
        ...base,
        adopted: false,
        reason: `need \u2265${o.minRows} resolved moments with \u2265${o.minPositives} wins (have ${n2}/${pos})`,
        freshRows: 0,
        current: val.length ? yield* evaluateSteps(cur, val) : EMPTY,
        candidate: EMPTY
      }
    };
  }
  const halfMs = o.halfLifeDays > 0 ? o.halfLifeDays * 864e5 : 0;
  const weigh = (list) => {
    let tMax = -Infinity;
    for (const r of list) if (r.ts > tMax) tMax = r.ts;
    return list.map((r) => (r.w ?? 1) * (halfMs ? Math.pow(0.5, (tMax - r.ts) / halfMs) : 1));
  };
  const fit = { ...o, zero: REDUNDANT[stageKey] };
  const boost = { ...o.boost, skip: REDUNDANT[stageKey].map((k) => FEATURE_KEYS.indexOf(k)) };
  const wA = weigh(partA);
  const lin = yield* fitStageSteps(cur, partA, wA, fit);
  const L = o.calibrate === false ? lin : yield* calibrateSteps(lin, partB);
  const sL = yield* scoreRowsSteps(L, val);
  const mL = sL.metrics;
  let H2 = null;
  let mH = null;
  let treesZ = 0;
  let treeCount = 0;
  if (o.trees && partA.length >= o.treesMinRows && partB.reduce((s, r) => s + r.y, 0) >= 10) {
    const dataA = yield* boostDataSteps(partA, wA, lin);
    const dataB = yield* boostDataSteps(partB, new Float32Array(partB.length).fill(1), lin);
    const res = yield* boostSteps(dataA, dataB, FEATURE_KEYS, boost);
    if (res.ens.trees.length) {
      const withTrees = { ...lin, trees: res.ens };
      H2 = o.calibrate === false ? withTrees : yield* calibrateSteps(withTrees, partB);
      const sH = yield* scoreRowsSteps(H2, val);
      mH = sH.metrics;
      treesZ = lossGainZ(sL.losses, sH.losses, val).z;
      treeCount = res.ens.trees.length;
    }
  }
  const treesWin = !!(H2 && mH && treesZ >= o.treesZ && !(mH.auc < mL.auc - 3e-3));
  const cand = treesWin ? H2 : L;
  const recipe = treesWin ? "trees" : "linear";
  const fresh = val.filter((r) => r.ts > seenTo2);
  const freshPos = fresh.reduce((s, r) => s + r.y, 0);
  const common = { ...base, freshRows: fresh.length, recipe, linear: mL, trees: mH ?? void 0, treeCount: treesWin ? treeCount : 0, treesZ: H2 ? treesZ : void 0 };
  if (fresh.length < o.minFreshRows || freshPos < o.minFreshPositives) {
    return {
      rows,
      report: {
        ...common,
        adopted: false,
        reason: `waiting for newer coins that neither model has seen (${fresh.length}/${o.minFreshRows} moments, ${freshPos}/${o.minFreshPositives} wins)`,
        current: yield* evaluateSteps(cur, fresh),
        candidate: yield* evaluateSteps(cand, fresh)
      }
    };
  }
  const sCur = yield* scoreRowsSteps(cur, fresh);
  const sCand = yield* scoreRowsSteps(cand, fresh);
  const mCur = sCur.metrics;
  const mCand = sCand.metrics;
  const gain = lossGainZ(sCur.losses, sCand.losses, fresh);
  const better = Number.isFinite(mCand.logLoss) && gain.gain > o.replaceMinGain && gain.z >= o.replaceZ && (!Number.isFinite(mCur.auc) || !Number.isFinite(mCand.auc) || mCand.auc >= mCur.auc - 5e-3);
  const what = treesWin ? `weighted sum + ${treeCount} trees` : "weighted sum";
  const report = {
    ...common,
    replaceZ: gain.z,
    adopted: better,
    reason: better ? `the new model (${what}) predicted ${fresh.length.toLocaleString("en-US")} newer moments better than the current one; neither had seen them` : `the current model still predicts newer moments (${fresh.length.toLocaleString("en-US")}) at least as well`,
    current: mCur,
    candidate: mCand
  };
  if (!better) return { rows, report };
  const wAll = weigh(sr);
  const linAll = yield* fitStageSteps(cur, sr, wAll, fit);
  let deploy = linAll;
  if (treesWin) {
    const res = yield* boostSteps(yield* boostDataSteps(sr, wAll, linAll), null, FEATURE_KEYS, { ...boost, rounds: treeCount });
    if (res.ens.trees.length) deploy = { ...deploy, trees: res.ens };
  }
  if (cand.calib) deploy = { ...deploy, calib: cand.calib };
  deploy.pRef = populationRate(sr, wAll) ?? deploy.pRef;
  deploy.scale = yield* scaleSteps(deploy, sr);
  deploy.trainedTo = sr.reduce((m, r) => Math.max(m, r.ts), 0);
  return { rows, report, deploy };
}
function* trainSteps(current, rows, opts = {}) {
  const o = { ...TRAIN_DEFAULTS, ...opts };
  const reports = [];
  let next = JSON.parse(JSON.stringify(current));
  const insight = {
    recipe: { ...current.insight?.recipe ?? {} },
    trees: { ...current.insight?.trees ?? {} },
    rows: { ...current.insight?.rows ?? {} },
    auc: { ...current.insight?.auc ?? {} }
  };
  let adoptedAny = false;
  for (const stageKey of ["curve", "amm"]) {
    const cur = current.stages[stageKey];
    const seenTo2 = cur.trainedTo ?? (current.source === "trained" ? current.training?.to ?? -Infinity : -Infinity);
    const res = yield* stageSteps(
      stageKey,
      cur,
      seenTo2,
      rows.filter((r) => r.stage === stageKey),
      o
    );
    reports.push(res.report);
    if (res.deploy) {
      next.stages[stageKey] = res.deploy;
      insight.recipe[stageKey] = res.report.recipe;
      insight.trees[stageKey] = res.deploy.trees?.trees.length ?? 0;
      insight.rows[stageKey] = res.rows;
      insight.auc[stageKey] = res.report.candidate.auc;
      adoptedAny = true;
    }
  }
  if (adoptedAny) {
    const now = o.now ?? Date.now();
    const won = reports.find((r) => r.adopted);
    next = {
      ...next,
      version: `trained-${new Date(now).toISOString().slice(0, 16)}`,
      createdAt: now,
      source: "trained",
      training: {
        rows: rows.length,
        positives: rows.reduce((s, r) => s + r.y, 0),
        from: rows.reduce((m, r) => Math.min(m, r.ts), Infinity),
        to: rows.reduce((m, r) => Math.max(m, r.ts), 0),
        valAuc: won?.candidate.auc,
        valLogLoss: won?.candidate.logLoss,
        priorValAuc: won?.current.auc,
        priorValLogLoss: won?.current.logLoss
      },
      insight
    };
  }
  return { model: next, reports };
}
function trainAndSelectAsync(current, rows, opts = {}) {
  return runStepsAsync(trainSteps(current, rows, opts));
}

// src/core/insight.ts
var HOUR_KEYS = /* @__PURE__ */ new Set(["hourSin", "hourCos"]);
function* driversSteps(model, stage, xs, limit = 10) {
  const n2 = xs.length;
  if (!n2) return [];
  const d = FEATURE_KEYS.length;
  const w = d + 1;
  function* measure(st) {
    const P = new Float64Array(n2 * w);
    for (let i = 0; i < n2; i++) {
      const pts2 = contributionPoints(st, xs[i]);
      for (let j = 0; j < d; j++) {
        if (HOUR_KEYS.has(FEATURE_KEYS[j])) P[i * w + d] += pts2[j];
        else P[i * w + j] = pts2[j];
      }
      if ((i & 255) === 255) yield;
    }
    const spread = new Float64Array(w);
    const dir = new Float64Array(w);
    for (let j = 0; j < w; j++) {
      let mp = 0;
      let mx = 0;
      for (let i = 0; i < n2; i++) {
        mp += P[i * w + j];
        if (j < d) mx += xs[i][j];
      }
      mp /= n2;
      mx /= n2;
      let dev = 0;
      let cxp = 0;
      let vx = 0;
      let vp = 0;
      for (let i = 0; i < n2; i++) {
        const dp = P[i * w + j] - mp;
        dev += Math.abs(dp);
        if (j < d) {
          const dx = xs[i][j] - mx;
          cxp += dx * dp;
          vx += dx * dx;
          vp += dp * dp;
        }
      }
      spread[j] = dev / n2;
      dir[j] = vx > 1e-12 && vp > 1e-12 ? cxp / Math.sqrt(vx * vp) : 0;
    }
    let total = 0;
    for (let j = 0; j < w; j++) if (j >= d || !HOUR_KEYS.has(FEATURE_KEYS[j])) total += spread[j];
    return { spread, dir, total };
  }
  const mine = yield* measure(model.stages[stage]);
  const base = priorModel().stages[stage];
  const start = yield* measure({ ...base, ...scalePrior(base, xs) });
  const out = [];
  for (let j = 0; j < w; j++) {
    if (j < d && HOUR_KEYS.has(FEATURE_KEYS[j])) continue;
    const points = mine.spread[j];
    if (!(points > 0.05)) continue;
    const c = mine.dir[j];
    out.push({
      key: j < d ? FEATURE_KEYS[j] : "hour",
      label: j < d ? FEATURE_DEFS[j].label : "Time of day",
      points,
      dir: j === d ? "mixed" : c >= 0.4 ? "up" : c <= -0.4 ? "down" : "mixed",
      share: mine.total > 0 ? points / mine.total : 0,
      priorShare: start.total > 0 ? start.spread[j] / start.total : void 0
    });
  }
  return out.sort((a, b) => b.points - a.points).slice(0, limit);
}
var BANDS = [
  [0, 25],
  [25, 50],
  [50, 65],
  [65, 75],
  [75, 85],
  [85, 101]
];
function seenTo(model, stage) {
  return model.stages[stage].trainedTo ?? (model.source === "trained" ? model.training?.to ?? -Infinity : -Infinity);
}
function freshCheckAsync(model, samples, opts = {}) {
  return runStepsAsync(freshSteps(model, samples, opts));
}
function* freshSteps(model, samples, opts) {
  const rows = trainingRows(samples, model.target, { horizonMs: opts.horizonMs });
  yield;
  const minRows = opts.minRows ?? 150;
  const minWins = opts.minWins ?? 10;
  const out = [];
  for (const stage of ["curve", "amm"]) {
    const since = seenTo(model, stage);
    const mine = rows.filter((r) => r.stage === stage && r.ts > since);
    const scored = [];
    for (const r of mine) {
      scored.push({ ...scoreVector(model, stage, r.x), y: r.y });
      if ((scored.length & 1023) === 1023) yield;
    }
    const wins2 = scored.reduce((s, r) => s + r.y, 0);
    const a = auc(
      scored.map((r) => r.p),
      scored.map((r) => r.y)
    );
    const byScore = [...scored].sort((x, y) => y.score - x.score);
    const top = byScore.slice(0, Math.max(1, Math.floor(byScore.length / 5)));
    const expected = model.insight?.auc?.[stage] ?? NaN;
    const bands = BANDS.map(([lo, hi]) => {
      const inBand = scored.filter((r) => r.score >= lo && r.score < hi);
      const n2 = inBand.length;
      return {
        lo,
        hi: Math.min(hi, 100),
        n: n2,
        predicted: n2 ? inBand.reduce((s, r) => s + r.p, 0) / n2 : NaN,
        actual: n2 ? inBand.reduce((s, r) => s + r.y, 0) / n2 : NaN
      };
    });
    let verdict = "working";
    if (mine.length < minRows || wins2 < minWins || !Number.isFinite(a)) verdict = "not_enough";
    else if (a < 0.55) verdict = "lost";
    else if (Number.isFinite(expected) && a < expected - 0.08) verdict = "slipping";
    out.push({
      stage,
      since,
      n: mine.length,
      wins: wins2,
      auc: a,
      expected,
      winRate: mine.length ? wins2 / mine.length : NaN,
      topWinRate: top.length ? top.reduce((s, r) => s + r.y, 0) / top.length : NaN,
      bands,
      verdict
    });
  }
  return out;
}
var r43 = (x) => Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : NaN;
function learnRunOf(reports, o) {
  return {
    ...o,
    adopted: reports.some((r) => r.adopted),
    stages: reports.map((r) => ({
      stage: r.stage,
      adopted: r.adopted,
      recipe: r.recipe,
      trees: r.treeCount,
      fresh: r.freshRows,
      before: { auc: r43(r.current.auc), logLoss: r43(r.current.logLoss) },
      after: { auc: r43(r.candidate.auc), logLoss: r43(r.candidate.logLoss) },
      reason: r.reason
    }))
  };
}
var pct0 = (x) => `${(x * 100).toFixed(0)}%`;
function adoptionNote(reports, o = {}) {
  const lines = reports.filter((r) => r.adopted).map((r) => {
    const where = r.stage === "amm" ? "Graduated coins" : "Bonding-curve coins";
    const how = r.recipe === "trees" ? `weighted sum + ${r.treeCount} trees, so it also learns combinations of signals` : "weighted sum";
    const was = Number.isFinite(r.current.auc) ? `, the old score ${pct0(r.current.auc)}` : "";
    return `\u2022 ${where}: on ${r.freshRows.toLocaleString("en-US")} newer moments neither score had seen, the new one ranked winners above losers ${pct0(r.candidate.auc)} of the time${was} (${how}).`;
  });
  const scale = o.anchored ? "\nThe score is anchored from now on: a typical coin scores 50 and the top 5% of coin moments 75, after every retrain. Your minimum score may let through fewer coins than before, and better ones." : "";
  return `\u{1F9E0} The bot learned from its newest outcomes and switched to a better score.
${lines.join("\n")}${scale}
Details: Learn tab \u2192 What the bot learned.`;
}
function learningViewAsync(model, o) {
  return runStepsAsync(viewSteps(model, o));
}
function* viewSteps(model, o) {
  const drivers = {};
  const driverCoins = {};
  for (const stage of ["curve", "amm"]) {
    const xs = [];
    for (let i = o.recent.length - 1; i >= 0 && xs.length < 3e3; i--) {
      const s = o.recent[i];
      if (s.stage === stage && s.kind === "checkpoint" && s.x?.length === FEATURE_KEYS.length) xs.push(s.x);
    }
    if (xs.length >= 30) {
      drivers[stage] = yield* driversSteps(model, stage, xs);
      driverCoins[stage] = xs.length;
    }
  }
  const fresh = yield* freshSteps(model, o.recent, { horizonMs: o.horizonMs });
  const recipe = {};
  for (const stage of ["curve", "amm"]) recipe[stage] = model.insight?.recipe?.[stage] ?? (!model.insight && model.source === "trained" ? "linear" : "prior");
  return {
    model: {
      version: model.version,
      source: model.source,
      createdAt: model.createdAt,
      target: model.target,
      recipe,
      trees: model.insight?.trees ?? {},
      rows: model.insight?.rows ?? {},
      training: model.training ?? null
    },
    drivers,
    driverCoins,
    fresh,
    history: o.history,
    status: o.status
  };
}

// src/core/report.ts
function nearestGrid(tp, sl) {
  let best = 0;
  let bestD = Infinity;
  GRID.forEach((g, i) => {
    const d = Math.abs(Math.log(g.tp / tp)) + Math.abs(g.sl - sl) / 25;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
function gridOf(s) {
  return s.grid?.length === GRID.length ? s.grid : void 0;
}
function observedReturn(s, tp, sl) {
  if (s.blind !== void 0 || s.ov === void 0 && s.stage === "amm") {
    if (!gridOf(s)) return void 0;
    const gi = GRID.findIndex((c) => c.tp === tp && c.sl === sl);
    if (!comboCounts(s, gi >= 0 ? gi : nearestGrid(tp, sl))) return void 0;
  }
  return sampleReturn(s, tp, sl).ret;
}
function sampleReturn(s, tp, sl) {
  if (s.tp === tp && s.sl === sl) return { ret: s.ret, exact: true };
  const g = gridOf(s);
  const gi = GRID.findIndex((c) => c.tp === tp && c.sl === sl);
  if (g && gi >= 0 && Number.isFinite(g[gi])) return { ret: g[gi], exact: true };
  return { ret: g?.[nearestGrid(tp, sl)] ?? s.ret, exact: false };
}
function valuesOf(rows, val) {
  const v = [];
  const h = [];
  for (const s of rows) {
    const x = val(s);
    if (x === void 0 || !Number.isFinite(x)) continue;
    v.push(x);
    h.push(hourOf(s.ts));
  }
  return { v, h };
}
function statsOf2({ v, h }) {
  const wins2 = v.filter((r) => r > 0).length;
  const w = wilson(wins2, v.length);
  const m = clusteredMeanCI(v, h);
  return { n: v.length, winRate: v.length ? wins2 / v.length : NaN, winLo: w.lo, winHi: w.hi, avgRet: m.mean, retLo: m.lo, retHi: m.hi };
}
function paperStats(closed) {
  const done = closed.filter((p) => p.status === "closed" && Number.isFinite(p.pnl));
  const wins2 = done.filter((p) => (p.pnl ?? 0) > 0);
  const gross = wins2.reduce((s, p) => s + (p.pnl ?? 0), 0);
  const loss = -done.filter((p) => (p.pnl ?? 0) <= 0).reduce((s, p) => s + (p.pnl ?? 0), 0);
  let peak = 0;
  let eq = 0;
  let mdd = 0;
  for (const p of [...done].sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0))) {
    eq += p.pnl ?? 0;
    peak = Math.max(peak, eq);
    mdd = Math.max(mdd, peak - eq);
  }
  return {
    trades: done.length,
    wins: wins2.length,
    winRate: done.length ? wins2.length / done.length : NaN,
    pnlSol: (gross - loss) / 1e9,
    avgPct: done.length ? done.reduce((s, p) => s + (p.pnlPct ?? 0), 0) / done.length : NaN,
    profitFactor: loss > 0 ? gross / loss : gross > 0 ? Infinity : NaN,
    maxDrawdownSol: mdd / 1e9
  };
}
function buildReport(samples, settings, model, closed, now) {
  const tp = settings.tpPct;
  const sl = settings.slPct;
  const checkpoints = samples.filter((s) => s.kind === "checkpoint");
  const signals = samples.filter((s) => s.kind === "signal");
  const exactCombo = samples.length === 0 || sampleReturn(samples[0], tp, sl).exact;
  const retOf = (s) => observedReturn(s, tp, sl);
  const t0 = samples.reduce((m, s) => Math.min(m, s.ts), Infinity);
  const t1 = samples.reduce((m, s) => Math.max(m, s.ts), 0);
  const spanHours = samples.length ? Math.max(1 / 60, (t1 - t0) / 36e5) : 0;
  const buckets = [];
  for (let lo = 0; lo < 100; lo += 10) {
    const hi = lo + 10;
    const rows = checkpoints.filter((s) => s.score >= lo && (s.score < hi || hi === 100 && s.score <= 100));
    const st = statsOf2(valuesOf(rows, retOf));
    const mm = rows.map((s) => s.maxMult).sort((a, b) => a - b);
    buckets.push({ lo, hi, n: st.n, winRate: st.winRate, winLo: st.winLo, winHi: st.winHi, avgRet: st.avgRet, retLo: st.retLo, retHi: st.retHi, medMaxMult: quantile(mm, 0.5) });
  }
  const sigAbove = signals.filter((s) => s.score >= settings.minScore);
  const signalStats = statsOf2(valuesOf(sigAbove, retOf));
  const entries = samples.filter((s) => s.kind === "entry");
  const thresholdSource = entries.length >= 200 ? "entries" : "checkpoints";
  const atLevel = (min) => thresholdSource === "entries" ? entries.filter((s) => s.tag === `x${min}`) : checkpoints.filter((s) => s.score >= min);
  const thresholds = [];
  for (let min = 50; min <= 95; min += 5) {
    const rows = atLevel(min);
    const st = statsOf2(valuesOf(rows, retOf));
    const tokens = new Set(rows.map((s) => s.mint)).size;
    thresholds.push({ min, n: st.n, tokensPerHour: spanHours > 0 ? tokens / spanHours : NaN, winRate: st.winRate, avgRet: st.avgRet, retLo: st.retLo, retHi: st.retHi });
  }
  const level = [...ENTRY_LEVELS].reverse().find((l) => l <= settings.minScore) ?? ENTRY_LEVELS[0];
  const levelEntries = entries.filter((s) => s.tag === `x${level}`);
  let gridSource;
  let pool;
  if (sigAbove.length >= 50) {
    gridSource = "signals";
    pool = sigAbove;
  } else if (levelEntries.length >= 50) {
    gridSource = "entries";
    pool = levelEntries;
  } else {
    gridSource = "checkpoints";
    pool = [...sigAbove, ...checkpoints.filter((s) => s.score >= settings.minScore)];
  }
  const grid = GRID.map((g, i) => {
    const st = statsOf2(valuesOf(pool, (s) => comboCounts(s, i) ? gridOf(s)?.[i] : void 0));
    return { tp: g.tp, sl: g.sl, n: st.n, avgRet: st.avgRet, retLo: st.retLo, retHi: st.retHi, winRate: st.winRate };
  });
  const credible = grid.filter((c) => c.n >= 50 && Number.isFinite(c.retLo));
  const best = credible.length ? credible.reduce((a, b) => b.retLo > a.retLo ? b : a) : null;
  const minN = 150;
  let gate;
  if (signalStats.n < minN) {
    gate = {
      pass: false,
      verdict: "Not enough evidence yet",
      detail: `${signalStats.n}/${minN} resolved signals at score \u2265 ${settings.minScore} with TP ${tp}% / SL ${sl}%. Keep paper trading.`
    };
  } else if (!(signalStats.retLo > 0.02)) {
    gate = {
      pass: false,
      verdict: signalStats.avgRet > 0 ? "Positive but not proven" : "Losing at these settings",
      detail: `Average ${(signalStats.avgRet * 100).toFixed(1)}% per trade (95% range ${(signalStats.retLo * 100).toFixed(1)}% to ${(signalStats.retHi * 100).toFixed(1)}%, counting coins bought in the same hour as one piece of evidence) after fees, delay and slippage. The low end must clear +2% before risking real money.`
    };
  } else {
    gate = {
      pass: true,
      verdict: "Evidence supports these settings",
      detail: `Average ${(signalStats.avgRet * 100).toFixed(1)}% per trade over ${signalStats.n} signals; 95% range ${(signalStats.retLo * 100).toFixed(1)}% to ${(signalStats.retHi * 100).toFixed(1)}%. Past results in this market can still stop working \u2014 start small.`
    };
  }
  let suggestion = null;
  const strict = 1 - 0.1 / (10 * GRID.length);
  const bound = (x, level2) => x.v.length >= 2 ? clusteredMeanCI(x.v, x.h, level2).lo : -Infinity;
  const cur = valuesOf(pool, retOf);
  let bestLo = cur.v.length >= 30 ? bound(cur, strict) : -Infinity;
  const mid = t0 + (t1 - t0) / 2;
  for (let min = 50; min <= 95; min += 5) {
    const rows = atLevel(min);
    if (rows.length < 150) continue;
    const older = rows.filter((s) => s.ts < mid);
    const newer = rows.filter((s) => s.ts >= mid);
    GRID.forEach((g, i) => {
      const val = (s) => comboCounts(s, i) ? gridOf(s)?.[i] : void 0;
      const all = valuesOf(rows, val);
      if (all.v.length < 150) return;
      const lo = bound(all, strict);
      if (!(lo > 0) || lo <= bestLo + 5e-3) return;
      const o = valuesOf(older, val);
      const nw = valuesOf(newer, val);
      if (o.v.length < 50 || nw.v.length < 50 || !(bound(o, 0.95) > 0) || !(bound(nw, 0.95) > 0)) return;
      const m = clusteredMeanCI(all.v, all.h);
      bestLo = lo;
      suggestion = {
        minScore: min,
        tpPct: g.tp,
        slPct: g.sl,
        avgRet: m.mean,
        retLo: lo,
        n: all.v.length,
        why: `${thresholdSource === "entries" ? "buying when coins first reached" : "coins scoring"} ${min}+ with TP ${g.tp}% / SL ${g.sl}% averaged ${(m.mean * 100).toFixed(1)}% per trade over ${all.v.length} outcomes, positive in both the older and newer half of the data (strict worst case ${(lo * 100).toFixed(1)}%)`
      };
    });
  }
  return {
    generatedAt: now,
    suggestion,
    samples: samples.length,
    checkpoints: checkpoints.length,
    signals: signals.length,
    entries: entries.length,
    spanHours,
    settings: { tpPct: tp, slPct: sl, minScore: settings.minScore },
    combo: { tp, sl, exact: exactCombo },
    breakEven: breakEvenP(tp, sl),
    buckets,
    signalStats,
    thresholds,
    thresholdSource,
    grid,
    gridSource,
    best,
    gate,
    paper: paperStats(closed),
    model: { version: model.version, source: model.source, training: model.training ?? null }
  };
}

// src/core/selfcheck.ts
var HOUR3 = 36e5;
var DAY2 = 24 * HOUR3;
var SELFCHECK = {
  /** trades compared, recorded vs real */
  windowMs: 7 * DAY2,
  /** pairs before the comparison is judged */
  minPairs: 20,
  /** recordings better than real trades by more than this (per trade, at the low end of the range) → warn */
  gap: 0.05,
  /** rule switches a day before the autopilot looks like it chases noise */
  maxSwitches: 4,
  /** a promise above this per trade is extraordinary for a real market */
  extraordinary: 0.3
};
var pct3 = (x, d = 1) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`;
var pts = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)} points`;
function recordedReturn(s, p) {
  const { tpPct, slPct, maxHoldMin } = p.plan;
  const gi = GRID.findIndex((g) => g.tp === tpPct && g.sl === slPct);
  if (gi < 0 || s.grid?.length !== GRID.length || !s.gridT) return void 0;
  const t = s.gridT[gi];
  if (maxHoldMin > 0 && t > maxHoldMin * 60) {
    const k = PATH_MIN.indexOf(maxHoldMin);
    const v = k >= 0 ? s.path?.[k] : void 0;
    return v !== void 0 && v !== null && seenAt(s, maxHoldMin * 60) ? v : void 0;
  }
  return comboObserved(s, gi) ? s.grid[gi] : void 0;
}
function pairTrades(closed, samples, from) {
  const signals = /* @__PURE__ */ new Map();
  for (const s of samples) {
    if (s.kind !== "signal") continue;
    let l = signals.get(s.mint);
    if (!l) signals.set(s.mint, l = []);
    l.push(s);
  }
  const out = [];
  for (const p of closed) {
    if (p.status !== "closed" || (p.closedAt ?? 0) < from || !Number.isFinite(p.pnlPct)) continue;
    if (!["tp", "sl", "time"].includes(p.exitReason ?? "") || p.plan.trailPct > 0 || p.plan.takeInitials) continue;
    const s = signals.get(p.mint)?.find((x) => x.ts >= p.signalAt && x.ts - p.signalAt <= 12e4);
    if (!s) continue;
    const rec = recordedReturn(s, p);
    if (rec === void 0) continue;
    out.push({ rec, real: (p.pnlPct ?? 0) / 100, hour: hourOf(p.openedAt) });
  }
  return out;
}
function recordedVsReal(closed, samples, now) {
  const title = "Recordings match real trades";
  const from = now - SELFCHECK.windowMs;
  const pairs = pairTrades(closed, samples, from);
  if (pairs.length < SELFCHECK.minPairs) {
    const done = closed.filter((p) => p.status === "closed" && (p.closedAt ?? 0) >= from).length;
    return {
      key: "recorded",
      status: "info",
      title,
      detail: `Not enough trades to compare yet: ${pairs.length} of ${SELFCHECK.minPairs} needed (${done} trades closed in the last 7 days). A trade is compared once the recording of its own moment has finished (up to 6 h), under the same exits, as far as it was observed; recordings of graduated coins from before this version are not trusted.`
    };
  }
  const d = clusteredMeanCI(
    pairs.map((x) => x.rec - x.real),
    pairs.map((x) => x.hour)
  );
  const rec = pairs.reduce((a, x) => a + x.rec, 0) / pairs.length;
  const real = pairs.reduce((a, x) => a + x.real, 0) / pairs.length;
  const range = `95% range ${pts(d.lo)} to ${pts(d.hi)}`;
  if (d.lo > SELFCHECK.gap)
    return {
      key: "recorded",
      status: "warn",
      title,
      detail: `On ${pairs.length} trades the recordings of the same coins at the same moments made ${pct3(rec)} per trade, the trades themselves ${pct3(real)} (${pts(d.mean)}, ${range}). What the bot learns and proves from recordings is too optimistic \u2014 its promises will not be kept.`
    };
  if (d.hi < -SELFCHECK.gap)
    return { key: "recorded", status: "info", title, detail: `The bot's own ${pairs.length} trades did better than their recordings (${pts(-d.mean)} per trade): the recordings are on the cautious side.` };
  return { key: "recorded", status: "ok", title, detail: `On ${pairs.length} trades recordings and real trades agree: ${pct3(rec)} vs ${pct3(real)} per trade (${pts(d.mean)}, ${range}).` };
}
function ruleDelivers(i) {
  const title = "The rule in use delivers";
  const st = i.autopilot;
  if (!i.autopilotOn || !st.active || !st.proof) {
    const day2 = i.closed.filter((p) => p.status === "closed" && p.mode === i.mode && (p.closedAt ?? 0) >= i.now - DAY2 && Number.isFinite(p.pnlPct));
    const pnl = day2.reduce((a, p) => a + (p.pnl ?? 0), 0) / 1e9;
    return { key: "rule", status: "info", title, detail: `Your own rule \u2014 nothing was promised for it. Last 24 h: ${day2.length} trades, ${pnl >= 0 ? "+" : ""}${pnl.toFixed(3)} SOL.` };
  }
  const mine = i.closed.filter((p) => p.status === "closed" && p.mode === i.mode && p.openedAt >= st.since && Number.isFinite(p.pnlPct));
  if (mine.length < 10) return { key: "rule", status: "info", title, detail: `${mine.length} trades so far under "${st.active}" \u2014 it promised at least ${pct3(st.proof.lo)} per trade.` };
  const m = clusteredMeanCI(
    mine.map((p) => (p.pnlPct ?? 0) / 100),
    mine.map((p) => hourOf(p.openedAt))
  );
  const said = `Its ${mine.length} trades averaged ${pct3(m.mean)} (95% range ${pct3(m.lo)} to ${pct3(m.hi)}); it promised at least ${pct3(st.proof.lo)}, typically ${pct3(st.proof.mean)}.`;
  if (m.mean < st.proof.lo) return { key: "rule", status: "warn", title, detail: `${said} Below its promise so far \u2014 once its own trades or the coins after its proof show it clearly worse, the autopilot drops it.` };
  return { key: "rule", status: "ok", title, detail: said };
}
function decisions(st, now) {
  const title = "Autopilot decisions are steady";
  const day2 = st.log.filter((x) => x.at >= now - DAY2);
  const answer = (i) => day2.slice(0, i).some((y) => /^You picked/.test(y.what) && day2[i].at - y.at <= 15 * 6e4);
  const switches = day2.filter((x, i) => /^(Now trading|Back to your own rule|Dropped)/.test(x.what) && !answer(i)).length;
  const picks = day2.filter((x) => /^You picked/.test(x.what)).length;
  const yours = picks ? ` You picked the rule ${picks} time${picks === 1 ? "" : "s"} (not counted).` : "";
  if (switches > SELFCHECK.maxSwitches)
    return { key: "decisions", status: "warn", title, detail: `${switches} rule changes by the autopilot in the last 24 h. A rule should stay until its results turn; this many changes looks like chasing noise.${yours}` };
  return { key: "decisions", status: "ok", title, detail: `${switches} rule change${switches === 1 ? "" : "s"} by the autopilot in the last 24 h.${yours}` };
}
function coverage(samples, now, feedDown) {
  const title = "The bot sees what it records";
  if (feedDown) return { key: "coverage", status: "fail", title, detail: "No trade data for over a minute: no new entries, and nothing open is observed until it is back." };
  const day2 = samples.filter((s) => s.resolvedAt >= now - DAY2 && s.ov === 1);
  const amm = day2.filter((s) => s.stage === "amm");
  const ammBlind = amm.filter((s) => s.blind !== void 0 && s.blindBy !== "feed");
  const outage = day2.filter((s) => s.blind !== void 0 && s.blindBy === "feed").length;
  const parts = [];
  if (amm.length)
    parts.push(
      `${Math.round(ammBlind.length / amm.length * 100)}% of graduated-coin recordings stopped being watched before they ended (the bot follows at most 40 pools). Those count only for rules whose time limit they were watched through, never by how they ended, so rules on graduated coins that hold long are judged by the bot's own trades`
    );
  if (outage) parts.push(`${Math.round(outage / day2.length * 100)}% of all recordings were cut by trade-feed outages (a minute or more without data)`);
  if (!day2.length) return { key: "coverage", status: "info", title, detail: "No recordings finished in the last 24 h yet." };
  const status = outage / day2.length > 0.1 ? "warn" : amm.length > 20 && ammBlind.length / amm.length > 0.5 ? "info" : "ok";
  return { key: "coverage", status, title, detail: parts.length ? `Last 24 h: ${parts.join("; ")}.` : `Last 24 h: all ${day2.length} recordings were observed to the end.` };
}
function extraordinary(i) {
  const title = "Promises are plausible";
  const p = i.autopilot.proof;
  if (!i.autopilotOn || !i.autopilot.active || !p || p.mean <= SELFCHECK.extraordinary)
    return { key: "extraordinary", status: "ok", title, detail: "No rule in use promises more than a real market plausibly pays." };
  return {
    key: "extraordinary",
    status: i.mode === "live" ? "warn" : "info",
    title,
    detail: `The rule in use showed ${pct3(p.mean)} per trade on data it never saw \u2014 extraordinary for a real market. Such numbers are more often a measuring problem than an edge: trust its own trades over the promise (see "Recordings match real trades").`
  };
}
function learningLoop(l, now) {
  const title = "Learning runs on time";
  if (l.everyHours <= 0) return { key: "learning", status: "info", title, detail: "Learning is off on this server (LEARN_EVERY_HOURS=0)." };
  if (l.lastError) return { key: "learning", status: "warn", title, detail: `The last learning run failed: ${l.lastError}` };
  const up = now - l.startedAt;
  if (l.lastRun && now - l.lastRun > (l.everyHours * 2 + 1) * HOUR3) return { key: "learning", status: "warn", title, detail: `The score last learned ${((now - l.lastRun) / HOUR3).toFixed(1)} h ago; it should every ${l.everyHours} h.` };
  if (up > 3 * HOUR3 && l.edgesAt && now - l.edgesAt > 6 * HOUR3) return { key: "learning", status: "warn", title, detail: `The edge finder last answered ${((now - l.edgesAt) / HOUR3).toFixed(1)} h ago; it should every 2 h.` };
  return { key: "learning", status: "ok", title, detail: l.lastRun ? `Last learned ${((now - l.lastRun) / 6e4).toFixed(0)} min ago.` : "First learning run 20 minutes after start." };
}
function engineHealth(e) {
  const title = "The engine runs cleanly";
  if (e.saveFailures > 0) return { key: "engine", status: "fail", title, detail: `Settings and positions could not be saved (${e.saveFailures} times in a row): ${e.saveError}. A restart would lose recent changes.` };
  if (e.errors > 0) return { key: "engine", status: "warn", title, detail: `${e.errors} internal error${e.errors === 1 ? "" : "s"} since start (details in the server log).` };
  return { key: "engine", status: "ok", title, detail: "No errors since start." };
}
function storageCheck(st) {
  const title = "Storage has room";
  if (!st) return { key: "storage", status: "info", title, detail: "Storage is not measured here." };
  const gb = (mb) => `${(mb / 1e3).toFixed(1)} GB`;
  if (st.recordingPaused || st.freeMb !== null && st.freeMb < st.minFreeMb)
    return {
      key: "storage",
      status: "fail",
      title,
      detail: `The disk is nearly full (${gb(st.freeMb ?? 0)} free): raw market recording is paused, and saving settings and positions is at risk. Free some space on the disk, or lower DATA_MAX_GB.`
    };
  if (st.freeMb !== null && st.freeMb < 2 * st.minFreeMb)
    return { key: "storage", status: "warn", title, detail: `Only ${gb(st.freeMb)} free on the disk; below ${gb(st.minFreeMb)} raw recording pauses. Free some space on the disk.` };
  return {
    key: "storage",
    status: "ok",
    title,
    detail: `Data ${gb(st.usedMb)} of at most ${gb(st.maxMb)}${st.freeMb !== null ? `, ${gb(st.freeMb)} free on the disk` : ""}. When it fills, the oldest raw recordings go first, then old outcomes (the newest 3 days are kept).`
  };
}
function runChecks(i) {
  return [
    recordedVsReal(i.closed, i.samples, i.now),
    ruleDelivers(i),
    decisions(i.autopilot, i.now),
    coverage(i.samples, i.now, i.engine.feedDown),
    extraordinary(i),
    learningLoop(i.learning, i.now),
    engineHealth(i.engine),
    storageCheck(i.storage)
  ];
}
var bad = (s) => s === "warn" || s === "fail";
function checkChanges(prev, next) {
  const out = [];
  for (const c of next) {
    const was = prev.get(c.key);
    if (bad(c.status) && !bad(was)) out.push(`${c.status === "fail" ? "\u{1F6D1}" : "\u26A0\uFE0F"} Self-check \u2014 ${c.title}: ${c.detail}`);
    else if (bad(was) && !bad(c.status)) out.push(`\u2705 Self-check \u2014 ${c.title}: fine again. ${c.detail}`);
  }
  return out;
}
function checksSummary(checks) {
  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  if (fails) return `\u{1F6D1} ${fails} problem${fails > 1 ? "s" : ""}${warns ? `, ${warns} to look at` : ""}`;
  if (warns) return `\u26A0\uFE0F ${warns} thing${warns > 1 ? "s" : ""} to look at`;
  return "\u2705 all checks fine";
}

// src/node/learner.ts
import { appendFileSync, existsSync as existsSync3, readFileSync as readFileSync3, rmSync } from "node:fs";
import { join } from "node:path";
var CYCLE_MS = 2 * 36e5;
var Learner = class {
  constructor(o) {
    this.o = o;
  }
  lastRun = 0;
  /** when the scorer next retrains (0 = learning is off) */
  nextRun = 0;
  lastReports = [];
  lastError = "";
  running = false;
  lastEdges = null;
  edgesRunning = false;
  /** past runs, oldest first */
  history = [];
  /** the current model on finished outcomes of coins it has not seen */
  lastFresh = [];
  autopilot = emptyAutopilot();
  /** the Lab (core/lab) */
  lab = emptyLab();
  labRunning = false;
  /** your ideas typed while the Lab was running, added once it is done */
  labPending = [];
  /** the latest self-check (core/selfcheck) and when it ran */
  checks = [];
  checksAt = 0;
  checkState = /* @__PURE__ */ new Map();
  /** the full comparison of recordings and real trades, from the last cycle's samples on disk */
  recordedCheck = null;
  startedAt = Date.now();
  lastDaily = 0;
  timer = null;
  /** the autopilot checks the rule in use against its own trades between searches too */
  watch = null;
  nextCycle = 0;
  driftNoted = "";
  stopped = false;
  piloting = false;
  seen = null;
  /** your own rule measured on the recordings (core/edges measureRule): at every search, and right after you pick one */
  ownMeasure = null;
  /** your pick is being measured: the autopilot does not replace it before that is known */
  measuring = false;
  measureAgain = false;
  /** a learning cycle holds the samples: a pick made meanwhile is measured with them at its end */
  cycling = false;
  start() {
    this.lastEdges = this.o.store.loadEdges() ?? null;
    if (this.lastEdges?.own) this.ownMeasure = { ...this.lastEdges.own, at: this.lastEdges.generatedAt };
    this.history = this.o.store.loadLearnHistory();
    this.autopilot = { ...emptyAutopilot(), ...this.o.store.loadAutopilot() ?? {} };
    this.lab = restoreLab(this.o.store.loadLab());
    this.seen = { autopilot: this.o.engine().settings.autopilot, mode: this.o.engine().settings.mode };
    this.startedAt = Date.now();
    this.lastDaily = (this.o.store.loadSelfCheck()?.lastDaily ?? 0) || Date.now();
    const s = this.o.engine().settings;
    if (s.autopilot && s.mode === "paper" && !this.autopilot.active && this.ownMeasure?.key !== ruleKey(s) && (this.lastEdges?.survivors.length ?? 0) > 0) void this.measureOwn();
    this.pilot();
    this.watch = setInterval(() => {
      this.pilot();
      this.selfCheck();
    }, 10 * 6e4);
    this.watch.unref?.();
    setTimeout(() => this.selfCheck(), this.o.firstCheckMs ?? 6e4).unref?.();
    if (this.o.everyHours <= 0) return;
    this.schedule(20 * 6e4);
  }
  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.watch) clearInterval(this.watch);
    this.nextRun = 0;
  }
  schedule(ms) {
    if (this.timer) clearTimeout(this.timer);
    this.nextCycle = Date.now() + ms;
    this.nextRun = this.learnDueAfter(this.nextCycle);
    this.timer = setTimeout(() => void this.cycle(), ms);
    this.timer.unref?.();
  }
  /** The first cycle at or after `from` at which the scorer is due to retrain. */
  learnDueAfter(from) {
    const due = this.lastRun ? this.lastRun + this.o.everyHours * 36e5 - 5 * 6e4 : 0;
    let t = from;
    while (t < due) t += CYCLE_MS;
    return t;
  }
  horizonMs() {
    return this.o.engine().cfg.outcomeHorizonMs;
  }
  /** One pass of the loop (see the top of the file). */
  async cycle() {
    this.cycling = true;
    try {
      const samples = await this.o.store.loadSamplesAsync(this.o.sampleDays);
      if (Date.now() >= this.learnDueAfter(Date.now() - 1)) await this.learn(samples, this.lastRun ? "schedule" : "start");
      await this.findEdges(samples);
      await this.runLab(samples);
      await this.checkDrift(samples);
      this.selfCheck(samples);
      this.cycling = false;
      if (this.measureAgain) await this.measureOwn(samples);
    } catch (e) {
      this.o.log.error("learning cycle failed", { err: String(e) });
    } finally {
      this.cycling = false;
      if (this.measureAgain && !this.measuring) void this.measureOwn();
      if (!this.stopped) this.schedule(CYCLE_MS);
    }
  }
  /**
   * Measures the rule in use on the recordings (core/edges measureRule) for the autopilot, then
   * lets it decide. Loads the samples unless given; while a cycle holds them, waits for its end.
   */
  async measureOwn(samples) {
    if (this.measuring || this.cycling && !samples) {
      this.measureAgain = true;
      return this.ownMeasure;
    }
    this.measuring = true;
    try {
      let rows = samples ? recordedRows(samples, this.horizonMs()) : null;
      do {
        this.measureAgain = false;
        if (!rows) rows = recordedRows(await this.o.store.loadSamplesAsync(this.o.sampleDays), this.horizonMs());
        const s = this.o.engine().settings;
        const tests = this.lastEdges?.status === "ok" ? this.lastEdges.candidates : void 0;
        this.ownMeasure = { ...measureRule(rows, s, { horizonMs: this.horizonMs(), tests }), at: Date.now() };
      } while (this.measureAgain);
    } catch (e) {
      this.o.log.warn("measuring your rule failed", { err: String(e) });
    } finally {
      this.measuring = false;
    }
    this.pilot();
    return this.ownMeasure;
  }
  /** You changed the rule by hand with the autopilot on: it stays on, and your pick competes (core/autopilot pickRule). */
  picked(s, prev) {
    const now = Date.now();
    this.autopilot = pickRule({ state: this.autopilot, settings: s, prev, report: this.lastEdges, extra: labProofs(this.lab, now), now });
    try {
      this.o.store.saveAutopilot(this.autopilot);
    } catch (e) {
      this.o.log.warn("autopilot state save failed", { err: String(e) });
    }
    if (this.autopilot.active) this.pilot();
    else void this.measureOwn();
  }
  /** Retrains early when a trained model clearly stopped ranking new coins (once per model). */
  async checkDrift(samples) {
    const engine = this.o.engine();
    const model = engine.model;
    this.lastFresh = await freshCheckAsync(model, samples, { horizonMs: this.horizonMs() });
    if (model.source !== "trained" || this.running || this.driftNoted === model.version) return;
    const bad2 = this.lastFresh.find((f2) => (f2.verdict === "slipping" || f2.verdict === "lost") && f2.n >= 300);
    if (!bad2 || Date.now() - this.lastRun < 3 * 36e5) return;
    this.driftNoted = model.version;
    const where = bad2.stage === "amm" ? "graduated" : "bonding-curve";
    const was = Number.isFinite(bad2.expected) ? ` (when it was adopted: ${(bad2.expected * 100).toFixed(0)}%)` : "";
    const msg = `\u{1F4C9} The score ${bad2.verdict === "lost" ? "stopped working" : "got clearly weaker"} on ${bad2.n} ${where} coins it has not seen: it ranked winners above losers ${(bad2.auc * 100).toFixed(0)}% of the time${was}. The market may have changed \u2014 retraining now instead of waiting for the schedule.`;
    this.o.log.warn(msg);
    this.o.onDrift?.(msg);
    await this.learn(samples, "drift");
    await this.findEdges(samples);
  }
  /** Searches the recorded outcomes for rules that made money on their own (see core/edges), then lets the autopilot act on the answer. */
  async findEdges(samples) {
    if (this.edgesRunning) return this.lastEdges;
    this.edgesRunning = true;
    try {
      const ap = this.autopilot;
      const incumbent = ap.active && ap.rule ? { rule: ap.rule, after: ap.proofTo ?? 0 } : void 0;
      const own = this.o.engine().settings;
      const rep = await findEdgesAsync(samples ?? await this.o.store.loadSamplesAsync(this.o.sampleDays), { placeboRuns: 5, horizonMs: this.horizonMs(), incumbent, own });
      if (rep.own) this.ownMeasure = { ...rep.own, at: rep.generatedAt };
      const before = new Set(this.lastEdges?.survivors.map((x) => x.text) ?? []);
      const fresh = rep.survivors.filter((x) => !before.has(x.text));
      this.lastEdges = rep;
      if (fresh.length) {
        const lines = fresh.slice(0, 3).map((x) => `\u2022 ${x.text}: ${(x.holdout.mean * 100).toFixed(1)}% per trade on unseen data (${x.holdout.n} trades)`);
        const trusted = rep.placebo.avgSurvivors <= AUTOPILOT.maxPlacebo;
        const next = !this.o.engine().settings.autopilot ? "Paper-trade it from the Learn tab, or turn the autopilot on (Bot tab)." : trusted ? "The autopilot picks the best one by itself (with real money, only one at the go-live bar)." : `The autopilot is not using them: on shuffled data the same search "found" ${rep.placebo.avgSurvivors.toFixed(1)} rules per run, so these may be luck.`;
        this.o.onEdges?.(`\u{1F50E} Edge finder: ${fresh.length} new rule${fresh.length > 1 ? "s" : ""} held up on data the search never saw.
${lines.join("\n")}
${next}`);
      }
      this.o.store.saveEdges(rep);
      if (rep.survivors.length) this.o.log.info("edge search", { survivors: rep.survivors.map((x) => x.text), placebo: rep.placebo.avgSurvivors });
      this.pilot();
      return rep;
    } catch (e) {
      this.o.log.error("edge search failed", { err: String(e) });
      return this.lastEdges;
    } finally {
      this.edgesRunning = false;
    }
  }
  /**
   * One Lab run (core/lab): the ideas' coins since the last run, the looks that are due, and new
   * ideas from the finished data; then the autopilot sees what it proved.
   */
  async runLab(samples) {
    if (this.labRunning) return this.lab;
    this.labRunning = true;
    try {
      const before = new Map(this.lab.ideas.map((i) => [i.id, i.status]));
      const res = await runLabAsync(samples ?? await this.o.store.loadSamplesAsync(this.o.sampleDays), this.lab, { now: Date.now(), horizonMs: this.horizonMs() });
      this.lab = res.state;
      for (const text of this.labPending.splice(0)) {
        const r = addLabIdea(this.lab, text);
        if (r.ok) this.lab = r.state;
        else this.o.log.warn("lab idea not added", { text, error: r.error });
      }
      this.takeLabInbox();
      this.saveLab();
      const pct4 = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
      for (const i of res.proven)
        this.o.onLab?.(
          `\u{1F9EA} Lab: an idea ${i.source === "you" ? "of yours" : "it invented"} held up on ${i.proof.n} coins that came after it \u2014 ${i.text}. ${pct4(i.proof.mean)} per trade (worst case ${pct4(i.proof.lo)}). ${this.o.engine().settings.autopilot ? "The autopilot weighs it like any proven rule." : "Turn the autopilot on to let it be used."}`
        );
      for (const i of this.lab.ideas)
        if (i.provenAt && i.status === "retired" && before.get(i.id) === "proven") this.o.onLab?.(`\u{1F9EA} Lab: "${i.text}" ${i.why}.`);
      if (res.proven.length || res.added.length) this.o.log.info("lab", { proven: res.proven.map((i) => i.code), added: res.added.map((i) => i.code) });
      this.pilot();
      return this.lab;
    } catch (e) {
      this.o.log.error("lab run failed", { err: String(e) });
      return this.lab;
    } finally {
      this.labRunning = false;
    }
  }
  /**
   * Ideas left in data/lab-inbox.txt — one rule per line in the Lab's format, lines starting with
   * # skipped — join the Lab at its next run like ideas typed in the dashboard: a session working
   * on this computer can hand the bot rules to prove on the coins that come after them. What
   * became of each line is appended to data/lab-inbox.done.txt.
   */
  takeLabInbox(now = Date.now()) {
    const file = join(this.o.store.dir, "lab-inbox.txt");
    if (!existsSync3(file)) return [];
    let lines;
    try {
      lines = readFileSync3(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
      rmSync(file);
    } catch (e) {
      this.o.log.warn("lab inbox unreadable", { err: String(e) });
      return [];
    }
    const at2 = new Date(now).toISOString().slice(0, 16).replace("T", " ");
    const done = lines.map((text) => {
      const r = addLabIdea(this.lab, text, now);
      if (!r.ok) return `${at2} not added: ${text} \u2014 ${r.error}`;
      this.lab = r.state;
      return `${at2} added: ${r.idea.code}`;
    });
    try {
      if (done.length) appendFileSync(join(this.o.store.dir, "lab-inbox.done.txt"), `${done.join("\n")}
`);
    } catch (e) {
      this.o.log.warn("lab inbox log failed", { err: String(e) });
    }
    return done;
  }
  saveLab() {
    try {
      this.o.store.saveLab(this.lab);
    } catch (e) {
      this.o.log.warn("lab save failed", { err: String(e) });
    }
  }
  /** Adds your own idea to the Lab (text, see core/lab parseLabRule). */
  addLabIdea(text) {
    const p = parseLabRule(text);
    if ("error" in p) return { ok: false, error: p.error };
    if (this.labRunning) {
      this.labPending.push(text);
      return { ok: true, note: "Added \u2014 the Lab is running right now; it joins the tests in a moment. Only coins from now on count for it." };
    }
    const r = addLabIdea(this.lab, text);
    if (!r.ok) return r;
    this.lab = r.state;
    this.saveLab();
    return { ok: true, note: `Testing: ${r.idea.text}. Only coins from now on count for it; it is first judged after ${LAB.looks[0]} finished coins (the first ones finish about ${Math.round(this.horizonMs() / 36e5)} hours from now).` };
  }
  /** What the dashboard shows about the Lab. */
  labView() {
    return labView(this.lab);
  }
  /** The Lab's summary to paste into a chat with Claude. */
  labSummary() {
    const engine = this.o.engine();
    const s = engine.settings;
    const own = trackRecord(s, engine.closed.toArray(), Date.now());
    const record = own ? `its last ${own.n} ${s.mode} trades made ${(own.mean * 100).toFixed(1)}% each on average` : void 0;
    return labSummary(this.lab, { rule: ruleSummary(s), record });
  }
  /** The autopilot's decision for this moment, applied (after every search, every 10 minutes, at start, and when the mode or the autopilot switch changes). */
  pilot() {
    if (this.piloting) return;
    this.piloting = true;
    try {
      const engine = this.o.engine();
      const now = Date.now();
      const d = decideAutopilot({
        report: this.lastEdges,
        settings: engine.settings,
        state: this.autopilot,
        closed: engine.closed.toArray(),
        now,
        extra: labProofs(this.lab, now),
        forward: this.autopilot.active ? labForward(this.lab, this.autopilot.active) : void 0,
        measured: this.ownMeasure,
        measuring: this.measuring || this.measureAgain
      });
      this.autopilot = d.state;
      if (d.settings) {
        engine.updateSettings(d.settings, "autopilot");
        engine.persistNow();
      }
      engine.autoHold = d.state.holding ? d.state.holdReason || "no rule proven for real money" : null;
      if (d.note) {
        this.o.log.info(`autopilot: ${d.note}`);
        this.o.onAutopilot?.(`\u{1F916} Autopilot: ${d.note}`);
      }
      if (d.note || d.action !== "none") {
        try {
          this.o.store.saveAutopilot(this.autopilot);
        } catch (e) {
          this.o.log.warn("autopilot state save failed", { err: String(e) });
        }
      }
    } finally {
      this.piloting = false;
    }
  }
  /**
   * The engine's settings changed: turning the autopilot on or off, or a new mode, is acted on at
   * once; a rule you pick by hand with the autopilot on competes with the proven ones (picked).
   */
  onSettings(s, why) {
    const was = this.seen;
    this.seen = { autopilot: s.autopilot, mode: s.mode };
    if (why?.by === "user" && why.prev.autopilot && s.autopilot && ruleChanged(why.prev, s)) return this.picked(s, why.prev);
    if (!was || was.autopilot !== s.autopilot || was.mode !== s.mode) this.pilot();
  }
  /**
   * Runs the self-check. With `samples` (the cycle's, from disk) recordings are compared with the
   * last 7 days of real trades; without, the latest such comparison is kept and the quick checks
   * are redone. A check that turns bad, or recovers, is sent at once.
   */
  selfCheck(samples) {
    try {
      const engine = this.o.engine();
      const now = Date.now();
      let checks = runChecks({
        now,
        closed: engine.closed.toArray(),
        samples: samples ?? engine.samples.toArray(),
        mode: engine.settings.mode,
        autopilotOn: engine.settings.autopilot,
        autopilot: this.autopilot,
        learning: { everyHours: this.o.everyHours, lastRun: this.lastRun, lastError: this.lastError, edgesAt: this.lastEdges?.generatedAt ?? 0, startedAt: this.startedAt },
        engine: { errors: engine.stats.errors, saveFailures: engine.saved.failures, saveError: engine.saved.error, feedDown: engine.feedOutage() },
        storage: this.o.storage?.()
      });
      if (samples) this.recordedCheck = checks.find((c) => c.key === "recorded") ?? null;
      else if (this.recordedCheck) checks = checks.map((c) => c.key === "recorded" ? this.recordedCheck : c);
      for (const msg of checkChanges(this.checkState, checks)) {
        this.o.log.warn(msg);
        this.o.onCheck?.(msg);
      }
      this.checkState = new Map(checks.map((c) => [c.key, c.status]));
      this.checks = checks;
      this.checksAt = now;
      if (now - this.lastDaily >= 24 * 36e5) this.daily(now);
    } catch (e) {
      this.o.log.error("self-check failed", { err: String(e) });
    }
  }
  /** Once a day: what the bot did, the rule it trades and how that goes, and every check. */
  daily(now) {
    const engine = this.o.engine();
    const s = engine.settings;
    const day2 = engine.closed.toArray().filter((p) => p.status === "closed" && p.mode === s.mode && (p.closedAt ?? 0) >= now - 24 * 36e5);
    const wins2 = day2.filter((p) => (p.pnl ?? 0) > 0).length;
    const pnl = day2.reduce((a, p) => a + (p.pnl ?? 0), 0) / 1e9;
    const rule = this.checks.find((c) => c.key === "rule");
    const lines = [
      `\u{1FA7A} <b>Daily check-up</b> (${s.mode})`,
      `Last 24 h: ${day2.length} trades, ${wins2} won, ${pnl >= 0 ? "+" : ""}${pnl.toFixed(3)} SOL.`,
      s.autopilot && this.autopilot.active ? `Autopilot trades: ${this.autopilot.active}` : `Rule: your own${s.autopilot ? " (autopilot on, nothing proven to switch to)" : ""}.`,
      rule ? rule.detail : "",
      `Self-check: ${checksSummary(this.checks)}`,
      ...this.checks.filter((c) => c.status === "warn" || c.status === "fail").map((c) => `\u2022 ${c.title}: ${c.detail}`)
    ].filter(Boolean);
    this.o.onCheck?.(lines.join("\n"));
    this.lastDaily = now;
    try {
      this.o.store.saveSelfCheck({ lastDaily: now });
    } catch (e) {
      this.o.log.warn("self-check state save failed", { err: String(e) });
    }
  }
  /** What the dashboard shows about the self-check. */
  checksView() {
    return { checks: this.checks, at: this.checksAt, summary: checksSummary(this.checks) };
  }
  /** What the dashboard shows about the autopilot. */
  autopilotView() {
    const now = Date.now();
    const engine = this.o.engine();
    return autopilotView({
      report: this.lastEdges,
      settings: engine.settings,
      state: this.autopilot,
      now,
      extra: labProofs(this.lab, now),
      forward: this.autopilot.active ? labForward(this.lab, this.autopilot.active) : void 0,
      closed: engine.closed.toArray(),
      measured: this.ownMeasure,
      measuring: this.measuring || this.measureAgain,
      horizonMs: this.horizonMs()
    });
  }
  /** Paper mode + autoTune (and the autopilot off): adopt a robustly better TP/SL/score combination. */
  autoTune(samples) {
    const engine = this.o.engine();
    const s = engine.settings;
    if (!s.autoTune || s.mode !== "paper" || s.autopilot) return;
    const r = buildReport(samples, s, engine.model, engine.closed.toArray(), Date.now());
    if (!r.suggestion) return;
    const g = r.suggestion;
    if (g.minScore === s.minScore && g.tpPct === s.tpPct && g.slPct === s.slPct) return;
    engine.updateSettings({ minScore: g.minScore, tpPct: g.tpPct, slPct: g.slPct });
    engine.persistNow();
    const msg = `\u{1F3AF} Auto-tune (paper): now score \u2265 ${g.minScore}, TP ${g.tpPct}%, SL ${g.slPct}% \u2014 ${g.why}`;
    this.o.log.info(msg);
    this.o.onTune?.(msg);
  }
  /** Retrain now (the dashboard's button), then search for rules and let the autopilot act. */
  async run(trigger = "manual") {
    if (this.running) return this.lastReports;
    const samples = await this.o.store.loadSamplesAsync(this.o.sampleDays);
    const reports = await this.learn(samples, trigger);
    void this.findEdges(samples);
    return reports;
  }
  /** Retrains the scorer on `samples` and switches models when the new one wins on coins neither has seen. */
  async learn(samples, trigger) {
    if (this.running) return this.lastReports;
    this.running = true;
    const started = Date.now();
    try {
      const engine = this.o.engine();
      const current = engine.model;
      const rows = trainingRows(samples, current.target, { horizonMs: this.horizonMs() });
      const { model, reports } = await trainAndSelectAsync(current, rows, { now: Date.now() });
      this.lastReports = reports;
      this.lastRun = Date.now();
      this.lastError = "";
      if (reports.some((r) => r.adopted) && !engine.setModel(model)) {
        this.o.log.error("trained model failed validation \u2014 kept the current one", { version: model.version });
      } else if (reports.some((r) => r.adopted)) {
        this.o.store.saveModel(model);
        this.o.log.info("new scoring model adopted", {
          version: model.version,
          reports: reports.map((r) => ({ stage: r.stage, recipe: r.recipe, trees: r.treeCount, auc: r.candidate.auc, was: r.current.auc, fresh: r.freshRows }))
        });
        const anchored = reports.some((r) => r.adopted && !current.stages[r.stage].scale);
        this.o.onAdopt?.(adoptionNote(reports, { anchored }), model);
      } else this.o.log.info("model kept", { reasons: reports.map((r) => `${r.stage}: ${r.reason}`) });
      this.lastFresh = await freshCheckAsync(engine.model, samples, { horizonMs: this.horizonMs() });
      this.history = [...this.history, learnRunOf(reports, { at: this.lastRun, trigger, version: engine.model.version, rows: rows.length, ms: Date.now() - started })].slice(-50);
      try {
        this.o.store.saveLearnHistory(this.history);
      } catch (e) {
        this.o.log.warn("learning history save failed", { err: String(e) });
      }
      this.autoTune(samples);
      return reports;
    } catch (e) {
      this.lastError = String(e);
      this.o.log.error("learning run failed", { err: String(e) });
      return [];
    } finally {
      this.running = false;
      if (this.nextCycle) this.nextRun = this.learnDueAfter(this.nextCycle);
    }
  }
};

// src/node/live/rent.ts
var TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
var TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
var CLOSE_ACCOUNT = 9;
function compactU16(n2) {
  const out = [];
  let v = n2;
  for (; ; ) {
    let b = v & 127;
    v >>= 7;
    if (v) b |= 128;
    out.push(b);
    if (!v) break;
  }
  return out;
}
function buildCloseAccountsTx(owner, targets, recentBlockhash) {
  if (targets.length === 0) throw new Error("nothing to close");
  if (targets.length > 20) throw new Error("too many accounts for one transaction");
  const programs = [...new Set(targets.map((t) => t.program))];
  const keys = [owner, ...targets.map((t) => t.account), ...programs];
  const index = (k) => keys.indexOf(k);
  const bytes = [];
  bytes.push(1, 0, programs.length);
  bytes.push(...compactU16(keys.length));
  for (const k of keys) {
    const b = base58Decode(k);
    if (b.length !== 32) throw new Error(`bad pubkey ${k}`);
    bytes.push(...b);
  }
  const bh = base58Decode(recentBlockhash);
  if (bh.length !== 32) throw new Error("bad blockhash");
  bytes.push(...bh);
  bytes.push(...compactU16(targets.length));
  for (const t of targets) {
    bytes.push(index(t.program));
    bytes.push(...compactU16(3), index(t.account), index(owner), index(owner));
    bytes.push(...compactU16(1), CLOSE_ACCOUNT);
  }
  const message = Uint8Array.from(bytes);
  const tx = new Uint8Array(1 + 64 + message.length);
  tx[0] = 1;
  tx.set(message, 65);
  return tx;
}

// src/node/live/solana.ts
import { createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from "node:crypto";
var PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
function walletFromSeed(seed) {
  if (seed.length !== 32) throw new Error("seed must be 32 bytes");
  const key = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(seed)]), format: "der", type: "pkcs8" });
  const spki = createPublicKey(key).export({ format: "der", type: "spki" });
  const publicKey = new Uint8Array(spki.subarray(spki.length - 32));
  return {
    address: base58Encode(publicKey),
    publicKey,
    sign: (m) => new Uint8Array(edSign(null, Buffer.from(m), key))
  };
}
function parseWalletSecret(secret) {
  const s = secret.trim();
  let bytes;
  if (s.startsWith("[")) {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr) || !arr.every((x) => Number.isInteger(x) && x >= 0 && x < 256)) throw new Error("wallet JSON must be a byte array");
    bytes = Uint8Array.from(arr);
  } else bytes = base58Decode(s);
  if (bytes.length === 64) {
    const w = walletFromSeed(bytes.subarray(0, 32));
    if (base58Encode(bytes.subarray(32)) !== w.address) throw new Error("wallet secret is corrupted: public key does not match");
    return w;
  }
  if (bytes.length === 32) return walletFromSeed(bytes);
  throw new Error(`wallet secret must be 64 or 32 bytes (got ${bytes.length})`);
}
function readCompactU16(b, off) {
  let value = 0;
  let size = 0;
  for (; ; ) {
    if (off + size >= b.length) throw new Error("truncated compact-u16");
    const byte = b[off + size];
    value |= (byte & 127) << 7 * size;
    size++;
    if ((byte & 128) === 0) break;
    if (size > 3) throw new Error("bad compact-u16");
  }
  return { value, size };
}
function parseTransaction(tx) {
  const sigs = readCompactU16(tx, 0);
  const sigOffset = sigs.size;
  const messageOffset = sigOffset + sigs.value * 64;
  if (messageOffset >= tx.length) throw new Error("transaction too short");
  let p = messageOffset;
  let version = "legacy";
  if (tx[p] & 128) {
    version = tx[p] & 127;
    p++;
  }
  const numRequiredSignatures = tx[p];
  p += 3;
  const keys = readCompactU16(tx, p);
  p += keys.size;
  const accountKeys = [];
  for (let i = 0; i < keys.value; i++) {
    if (p + 32 > tx.length) throw new Error("truncated account keys");
    accountKeys.push(base58Encode(tx.subarray(p, p + 32)));
    p += 32;
  }
  if (sigs.value !== numRequiredSignatures) throw new Error("signature count does not match message header");
  return { numSignatures: sigs.value, sigOffset, messageOffset, version, numRequiredSignatures, accountKeys };
}
function signTransaction(tx, wallet) {
  const parsed = parseTransaction(tx);
  const idx = parsed.accountKeys.slice(0, parsed.numRequiredSignatures).indexOf(wallet.address);
  if (idx < 0) throw new Error("transaction does not require this wallet's signature");
  const message = tx.subarray(parsed.messageOffset);
  const sig3 = wallet.sign(message);
  const out = new Uint8Array(tx);
  out.set(sig3, parsed.sigOffset + idx * 64);
  return { signed: out, signature: base58Encode(out.subarray(parsed.sigOffset, parsed.sigOffset + 64)) };
}
var SolanaRpc = class {
  constructor(url) {
    this.url = url;
  }
  async call(method, params, timeoutMs = 1e4) {
    const res = await postJson(this.url, { jsonrpc: "2.0", id: Date.now(), method, params }, { timeoutMs });
    if (!res.json) throw new Error(`${method}: HTTP ${res.status} ${res.text.slice(0, 120)}`);
    if (res.json.error) throw new Error(`${method}: ${res.json.error.message ?? res.json.error.code}`);
    return res.json.result;
  }
  sendTransaction(signed) {
    return this.call("sendTransaction", [base64Encode(signed), { encoding: "base64", skipPreflight: true, maxRetries: 0 }]);
  }
  async signatureStatus(sig3) {
    const r = await this.call("getSignatureStatuses", [[sig3], { searchTransactionHistory: false }]);
    const v = r?.value?.[0];
    if (!v) return null;
    return { confirmed: v.confirmationStatus === "confirmed" || v.confirmationStatus === "finalized", err: v.err ?? null };
  }
  getTransaction(sig3) {
    return this.call("getTransaction", [sig3, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }], 15e3);
  }
  async balance(address) {
    const r = await this.call("getBalance", [address, { commitment: "confirmed" }]);
    return r.value;
  }
  async latestBlockhash() {
    const r = await this.call("getLatestBlockhash", [{ commitment: "confirmed" }]);
    return r.value.blockhash;
  }
  /** Token accounts of `owner` under a token program, with mint and raw amount. */
  async tokenAccounts(owner, programId) {
    const r = await this.call(
      "getTokenAccountsByOwner",
      [owner, { programId }, { encoding: "jsonParsed", commitment: "confirmed" }],
      15e3
    );
    return (r.value ?? []).map((a) => ({ pubkey: a.pubkey, mint: a.account.data.parsed.info.mint, amount: Number(a.account.data.parsed.info.tokenAmount.amount) }));
  }
  async tokenBalance(owner, mint) {
    const r = await this.call("getTokenAccountsByOwner", [
      owner,
      { mint },
      { encoding: "jsonParsed", commitment: "confirmed" }
    ]);
    let total = 0;
    for (const a of r.value ?? []) total += Number(a.account.data.parsed.info.tokenAmount.amount);
    return total;
  }
};
function measureFill(tx, owner, mint) {
  if (!tx.meta) return null;
  const keys = tx.transaction.message.accountKeys.map((k) => typeof k === "string" ? k : k.pubkey);
  const i = keys.indexOf(owner);
  if (i < 0) return null;
  const solDelta = (tx.meta.postBalances[i] ?? 0) - (tx.meta.preBalances[i] ?? 0);
  const sum = (rows) => (rows ?? []).filter((r) => r.owner === owner && r.mint === mint).reduce((s, r) => s + Number(r.uiTokenAmount.amount), 0);
  const tokenDelta = sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances);
  return { solDelta, tokenDelta };
}

// src/node/live/executor.ts
var LiveExecutor = class {
  constructor(o) {
    this.o = o;
    this.rpc = new SolanaRpc(o.rpcHttp);
    try {
      this.wallet = parseWalletSecret(o.walletSecret);
      o.log.info("live wallet loaded", { address: this.wallet.address });
    } catch (e) {
      this.halted = `wallet: ${e.message}`;
      o.log.error("live wallet could not be loaded", { err: e.message });
    }
  }
  kind = "live";
  wallet = null;
  rpc;
  balanceLamports = -1;
  errorsInRow = 0;
  halted = "";
  inflight = /* @__PURE__ */ new Set();
  dayKey = "";
  dayLoss = 0;
  timer = null;
  rentTimer = null;
  reclaimed = 0;
  start() {
    const refresh = async () => {
      if (!this.wallet) return;
      try {
        this.balanceLamports = await this.rpc.balance(this.wallet.address);
      } catch (e) {
        this.o.log.warn("wallet balance refresh failed", { err: String(e) });
      }
    };
    void refresh();
    this.timer = setInterval(() => void refresh(), 3e4);
    this.rentTimer = setInterval(() => void this.reclaimRent(), 15 * 6e4);
    this.rentTimer.unref?.();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.rentTimer) clearInterval(this.rentTimer);
  }
  /** Close empty token accounts (not belonging to open positions) to get their rent back. */
  async reclaimRent() {
    const w = this.wallet;
    if (!w) return 0;
    try {
      const held = new Set([...this.o.engine().positions.values()].map((p) => p.mint));
      const targets = [];
      for (const program of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
        for (const a of await this.rpc.tokenAccounts(w.address, program)) {
          if (a.amount === 0 && !held.has(a.mint) && !this.inflight.has(`buy:${a.mint}`) && !this.inflight.has(`sell:${a.mint}`)) targets.push({ account: a.pubkey, program });
        }
      }
      if (targets.length === 0) return 0;
      const batch = targets.slice(0, 12);
      const tx = buildCloseAccountsTx(w.address, batch, await this.rpc.latestBlockhash());
      const { signed, signature } = signTransaction(tx, w);
      await this.rpc.sendTransaction(signed);
      this.reclaimed += batch.length;
      this.o.log.info("rent reclaim sent", { accounts: batch.length, approxSol: +(batch.length * 203928e-8).toFixed(5), signature });
      return batch.length;
    } catch (e) {
      this.o.log.warn("rent reclaim failed", { err: String(e) });
      return 0;
    }
  }
  status() {
    return {
      address: this.wallet?.address ?? null,
      balanceSol: this.balanceLamports >= 0 ? this.balanceLamports / 1e9 : null,
      halted: this.halted || null,
      maxPositionSol: this.o.maxPositionSol,
      maxDailyLossSol: this.o.maxDailyLossSol,
      dayLossSol: this.dayLoss / 1e9
    };
  }
  ready() {
    return !!this.wallet && !this.halted && this.balanceLamports !== 0;
  }
  maxPositionSol() {
    return this.o.maxPositionSol;
  }
  resume() {
    this.halted = "";
    this.errorsInRow = 0;
  }
  /** Called by the engine after each closed live position. */
  notePnl(lamports, ts) {
    const k = new Date(ts).toISOString().slice(0, 10);
    if (k !== this.dayKey) {
      this.dayKey = k;
      this.dayLoss = 0;
    }
    if (lamports < 0) this.dayLoss += -lamports;
    if (this.o.maxDailyLossSol > 0 && this.dayLoss >= this.o.maxDailyLossSol * 1e9) {
      this.halt(`daily live loss cap reached (${(this.dayLoss / 1e9).toFixed(3)} SOL)`);
    }
  }
  halt(why) {
    if (this.halted) return;
    this.halted = why;
    this.o.log.error(`LIVE TRADING HALTED: ${why}`);
    this.o.onAlert?.(`\u{1F6D1} LIVE trading halted: ${why}`);
  }
  submit(order) {
    void this.execute(order).then(
      (r) => this.o.engine().onOrderResult(r),
      (e) => {
        this.o.log.error("live order crashed", { err: String(e) });
        this.o.engine().onOrderResult({ orderId: order.id, ok: false, error: "live_error", ts: Date.now(), lamports: 0, tokens: 0 });
      }
    );
  }
  fail(order, error) {
    return { orderId: order.id, ok: false, error, ts: Date.now(), lamports: 0, tokens: 0 };
  }
  async execute(order) {
    const w = this.wallet;
    if (!w) return this.fail(order, "live_disabled");
    if (order.side === "buy") {
      if (this.halted) return this.fail(order, "live_disabled");
      if (order.amount > this.o.maxPositionSol * 1e9 + 1) return this.fail(order, "live_error");
      if (this.balanceLamports >= 0 && this.balanceLamports < order.amount + 1e7) return this.fail(order, "insufficient_balance");
    }
    const key = `${order.side}:${order.mint}`;
    if (this.inflight.has(key)) return this.fail(order, "pending");
    this.inflight.add(key);
    try {
      const engine = this.o.engine();
      const body = {
        publicKey: w.address,
        action: order.side,
        mint: order.mint,
        amount: order.side === "buy" ? +(order.amount / 1e9).toFixed(9) : order.closesAccount ? "100%" : Math.floor(order.amount) / 1e6,
        denominatedInSol: order.side === "buy" ? "true" : "false",
        slippage: Math.round(order.slippagePct),
        priorityFee: engine.settings.priorityFeeSol,
        pool: "auto"
      };
      const f2 = this.o.fetchImpl ?? fetch;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1e4);
      let txBytes;
      try {
        const res = await f2(this.o.tradeApi ?? "https://pumpportal.fun/api/trade-local", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal
        });
        if (res.status !== 200) {
          const text = (await res.text()).slice(0, 200);
          this.o.log.warn("trade API refused order", { status: res.status, text });
          return this.noteError(order, "live_error");
        }
        txBytes = new Uint8Array(await res.arrayBuffer());
      } finally {
        clearTimeout(t);
      }
      const { signed, signature } = signTransaction(txBytes, w);
      const started = Date.now();
      const deadline = started + (this.o.confirmTimeoutMs ?? 75e3);
      const poll = this.o.pollMs ?? 1e3;
      let lastSend = 0;
      let status = null;
      while (Date.now() < deadline) {
        if (Date.now() - lastSend >= 2e3) {
          lastSend = Date.now();
          try {
            await this.rpc.sendTransaction(signed);
          } catch (e) {
            this.o.log.debug("send retry", { err: String(e) });
          }
        }
        await new Promise((r) => setTimeout(r, poll));
        try {
          status = await this.rpc.signatureStatus(signature);
        } catch {
          status = null;
        }
        if (status && (status.confirmed || status.err)) break;
      }
      if (!status || !status.confirmed && !status.err) {
        await new Promise((r) => setTimeout(r, Math.min(2e4, (this.o.confirmTimeoutMs ?? 75e3) / 4)));
        status = await this.rpc.call("getSignatureStatuses", [[signature], { searchTransactionHistory: true }]).then((r) => r?.value?.[0] ? { confirmed: ["confirmed", "finalized"].includes(r.value[0].confirmationStatus ?? ""), err: r.value[0].err ?? null } : null).catch(() => null);
        if (!status || !status.confirmed && !status.err) return this.noteError(order, order.side === "buy" ? "live_timeout" : "live_error");
      }
      if (status.err) {
        const errText = JSON.stringify(status.err);
        const slip = /6002|6003|6004|TooMuch|TooLittle|Slippage|0x1772|0x1773/i.test(errText);
        this.o.log.warn("live transaction failed on-chain", { signature, err: errText });
        return this.noteError(order, slip ? "slippage" : "live_error", slip);
      }
      const tx = await this.rpc.getTransaction(signature).catch(() => null);
      const fill = tx ? measureFill(tx, w.address, order.mint) : null;
      this.errorsInRow = 0;
      const tok = engine.tokens.get(order.mint);
      if (!fill) {
        this.o.log.warn("fill could not be measured, using order values", { signature });
        return { orderId: order.id, ok: true, ts: Date.now(), lamports: order.side === "buy" ? order.amount : 0, tokens: order.side === "buy" ? 0 : order.amount, mcapSol: tok?.mcapSol, sig: signature };
      }
      if (order.side === "buy") {
        return { orderId: order.id, ok: true, ts: Date.now(), lamports: Math.max(0, -fill.solDelta), tokens: Math.max(0, fill.tokenDelta), mcapSol: tok?.mcapSol, sig: signature };
      }
      return { orderId: order.id, ok: true, ts: Date.now(), lamports: Math.max(0, fill.solDelta), tokens: Math.max(0, -fill.tokenDelta), mcapSol: tok?.mcapSol, sig: signature };
    } catch (e) {
      this.o.log.error("live execution error", { err: String(e.message ?? e) });
      return this.noteError(order, "live_error");
    } finally {
      this.inflight.delete(key);
    }
  }
  noteError(order, error, expected = false) {
    if (!expected) {
      this.errorsInRow++;
      if (this.errorsInRow >= 4) this.halt(`${this.errorsInRow} live errors in a row (last: ${error})`);
    }
    return this.fail(order, error);
  }
};

// src/node/log.ts
var ORDER = { debug: 10, info: 20, warn: 30, error: 40 };
var SECRET_KEYS = /key|secret|token|password|private/i;
function redact(data, depth = 0) {
  if (depth > 4 || data === null || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.slice(0, 20).map((x) => redact(x, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(data)) out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
  return out;
}
var ServerLog = class {
  constructor(level = "info", sink = () => {
  }) {
    this.level = level;
    this.sink = sink;
  }
  tail = new Ring(400);
  write(level, msg, data) {
    if (ORDER[level] < ORDER[this.level]) return;
    const line = { ts: Date.now(), level, msg, data: data === void 0 ? void 0 : redact(data) };
    this.tail.push(line);
    const text = `${new Date(line.ts).toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}${line.data !== void 0 ? " " + safeJson(line.data) : ""}`;
    if (level === "error" || level === "warn") console.error(text);
    else console.log(text);
    try {
      this.sink(line);
    } catch {
    }
  }
  debug(msg, data) {
    this.write("debug", msg, data);
  }
  info(msg, data) {
    this.write("info", msg, data);
  }
  warn(msg, data) {
    this.write("warn", msg, data);
  }
  error(msg, data) {
    this.write("error", msg, data);
  }
};
function safeJson(x) {
  try {
    const s = JSON.stringify(x);
    return s.length > 800 ? s.slice(0, 800) + "\u2026" : s;
  } catch {
    return String(x);
  }
}

// src/node/router.ts
function dedupeKey(ev) {
  const sig3 = ev.sig;
  if (!sig3) return null;
  switch (ev.k) {
    case "create":
    case "complete":
    case "migrate":
      return `${ev.k}:${sig3}:${ev.mint}`;
    case "trade":
      return `t:${sig3}:${ev.mint}:${ev.user}:${ev.buy ? 1 : 0}:${Math.round(ev.tok / 1e3)}`;
    case "ammSwap":
      return `a:${sig3}:${ev.pool}:${ev.user}:${ev.buy ? 1 : 0}:${Math.round(ev.base / 1e3)}`;
    case "pool":
      return `p:${sig3}:${ev.pool}`;
    default:
      return null;
  }
}
var EventRouter = class {
  constructor(deliver, rpcHealthy) {
    this.deliver = deliver;
    this.rpcHealthy = rpcHealthy;
  }
  seen = new LRU(2e5);
  duplicates = 0;
  dropped = 0;
  push(ev) {
    if (ev.src === "pumpportal" && ev.k === "trade" && this.rpcHealthy()) {
      this.dropped++;
      return;
    }
    const k = dedupeKey(ev);
    if (k) {
      if (this.seen.has(k)) {
        this.duplicates++;
        return;
      }
      this.seen.set(k, 1);
    }
    this.deliver(ev);
  }
};

// src/node/server.ts
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync as readFileSync6, readdirSync as readdirSync2 } from "node:fs";
import { join as join4 } from "node:path";

// src/core/api.ts
var ok = (json) => ({ status: 200, json });
var err = (status, error) => ({ status, json: { error } });
function accountSummary(e) {
  const a = e.account();
  return { ...a, closed: a.closed.slice(0, 50), equityCurve: a.equityCurve.slice(-400) };
}
async function handleApi(ctx, method, path, query, body) {
  const e = ctx.engine();
  if (method === "GET") {
    switch (path) {
      case "/api/state":
        return ok({
          settings: e.settings,
          account: accountSummary(e),
          health: ctx.health(),
          funnel: { hour: e.funnel.summary(e.clock, 1), day: e.funnel.summary(e.clock, 24) },
          signals: e.funnel.recent.toArray().slice(-150).reverse(),
          serverTime: Date.now(),
          solUsd: e.solUsd
        });
      case "/api/radar":
        return ok({
          rows: e.radar({
            limit: Number(query.get("limit") ?? 80),
            minScore: Number(query.get("minScore") ?? 0),
            stage: query.get("stage") ?? "all",
            sort: query.get("sort") ?? "score"
          })
        });
      case "/api/signals":
        return ok({ signals: e.funnel.recent.toArray().reverse(), hour: e.funnel.summary(e.clock, 1), day: e.funnel.summary(e.clock, 24) });
      case "/api/learn": {
        const days = Math.min(60, Math.max(1, Number(query.get("days") ?? 14)));
        const stored = await ctx.samples(days);
        const samples = stored.length ? stored : e.samples.toArray();
        return ok(buildReport(samples, e.settings, e.model, e.closed.toArray(), Date.now()));
      }
      case "/api/wallets":
        return ok({ wallets: e.wallets.leaderboard(60), smart: e.wallets.smartCount(), tracked: e.wallets.size });
      case "/api/narratives":
        return ok({
          clusters: e.narratives.hot(40, (m) => e.tokens.get(m)?.mcapSol ?? 0).map((c) => ({
            ...c,
            leaderName: c.leader ? e.tokens.get(c.leader)?.name : void 0,
            leaderSymbol: c.leader ? e.tokens.get(c.leader)?.symbol : void 0,
            leaderScore: c.leader ? e.scoreOf(c.leader)?.res.score : void 0
          }))
        });
      case "/api/logs":
        return ok({ lines: ctx.logs() });
      case "/api/edges":
        return ok({ report: ctx.edges() ?? null });
      case "/api/learning":
        return ok({ view: await ctx.learning?.() ?? null });
      case "/api/autopilot":
        return ok({ view: ctx.autopilot?.() ?? null });
      case "/api/checks":
        return ok({ view: ctx.checks?.() ?? null });
      case "/api/lab":
        return ok({ view: ctx.lab?.() ?? null });
      case "/api/lab/summary":
        return ctx.labSummary ? ok({ text: ctx.labSummary() }) : err(404, "The Lab runs on the server bot only.");
      case "/api/diagnosis":
        return ctx.diagnosis ? ok({ text: await ctx.diagnosis() }) : err(404, "The diagnosis runs on the server bot only.");
      default:
        if (path.startsWith("/api/token/")) {
          const d = e.tokenDetail(decodeURIComponent(path.slice(11)));
          return d ? ok(d) : err(404, "Coin not tracked right now.");
        }
        return err(404, "unknown endpoint");
    }
  }
  if (method === "POST") {
    switch (path) {
      case "/api/settings": {
        if (body.mode === "live" && !ctx.live?.allowed()) {
          return err(400, "Live mode is locked: the server has no live trading enabled or the wallet is not ready. See Setup \u2192 Go live.");
        }
        const s = e.updateSettings(body);
        e.persistNow();
        ctx.onSettingsChanged?.();
        return ok({ settings: s });
      }
      case "/api/kill":
        e.setKill(!!body.on, !!body.sellAll);
        e.persistNow();
        return ok({ killed: e.killed });
      case "/api/learn/run":
        return ok({ reports: await ctx.learnRun() });
      case "/api/edges/run":
        return ok({ report: await ctx.edgesRun() });
      case "/api/lab/idea": {
        if (!ctx.labIdea) return err(404, "The Lab runs on the server bot only.");
        const text = typeof body.text === "string" ? body.text.slice(0, 300) : "";
        const r = ctx.labIdea(text);
        return r.ok ? ok(r) : err(400, r.error);
      }
      case "/api/live/resume":
        ctx.live?.resume();
        return ok({ live: ctx.live?.status() ?? null });
      case "/api/paper/add": {
        const amount = Number(body.sol);
        if (!(amount > 0 && amount <= 1e6)) return err(400, "Add between 0 and 1,000,000 paper SOL.");
        e.addPaperMoney(amount);
        e.persistNow();
        return ok({ ok: true, paperBalance: e.paperBalance });
      }
      case "/api/paper/reset": {
        if (e.positions.size > 0) return err(400, "Close open positions first.");
        e.paperBalance = e.cfg.paperStartSol * 1e9;
        e.stats.realized = 0;
        e.stats.dayPnl = 0;
        e.stats.wins = 0;
        e.stats.losses = 0;
        e.stats.equity = [{ t: Date.now(), v: e.paperBalance }];
        e.stats.deposits = 0;
        e.closed.clear();
        e.persistNow();
        return ok({ ok: true });
      }
      default:
        if (path.startsWith("/api/positions/") && path.endsWith("/close")) {
          const id = decodeURIComponent(path.slice(15, -6));
          const done = e.closeManually(id, "manual");
          return done ? ok({ ok: true }) : err(400, "Position is not closable right now (no price, or an order is in flight).");
        }
        return err(404, "unknown endpoint");
    }
  }
  return err(405, "method not allowed");
}

// src/core/diagnose.ts
var HOUR4 = 36e5;
var at = (t) => t ? `${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC` : "\u2014";
var p1 = (x) => {
  if (!Number.isFinite(x)) return "\u2014";
  const v = Math.round(x * 1e3) / 10;
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(1)}%`;
};
var n0 = (x) => Math.round(x).toLocaleString("en-US");
var share = (a, b) => b ? `${Math.round(a / b * 100)}%` : "\u2014";
var ago = (t, now) => {
  const m = Math.max(0, Math.round((now - t) / 6e4));
  return m < 120 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
var entryName = (tag) => /^x\d+$/.test(tag) ? `first reaching score ${tag.slice(1)}` : entryLabel(tag);
var exitName = (e) => {
  const g = GRID[Math.floor(e / HOLDS_MIN.length)];
  const hold = HOLDS_MIN[e % HOLDS_MIN.length];
  return `+${g.tp}% / \u2212${g.sl}%${hold ? `, ${hold} min` : ""}`;
};
function trades(list) {
  if (!list.length) return "none";
  const wins2 = list.filter((p) => (p.pnl ?? 0) > 0).length;
  const mean2 = list.reduce((a, p) => a + (p.pnlPct ?? 0), 0) / list.length / 100;
  const sol2 = list.reduce((a, p) => a + (p.pnl ?? 0), 0) / 1e9;
  const how = /* @__PURE__ */ new Map();
  for (const p of list) how.set(p.exitReason ?? "?", (how.get(p.exitReason ?? "?") ?? 0) + 1);
  const ends = [...how].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
  const from = Math.min(...list.map((p) => p.openedAt));
  return `${list.length} (${wins2} won) \xB7 ${p1(mean2)} per trade on average \xB7 ${sol2 >= 0 ? "+" : ""}${sol2.toFixed(3)} SOL in all \xB7 ended by: ${ends} \xB7 since ${at(from)}`;
}
function* steps2(i) {
  const s = i.settings;
  const out = [];
  out.push(`SIGNAL diagnosis \xB7 ${at(i.now)}${i.version ? ` \xB7 version ${i.version}` : ""}`);
  out.push(`Mode ${s.mode} \xB7 auto-trading ${s.enabled ? "on" : "off"} \xB7 autopilot ${s.autopilot ? "on" : "off"} \xB7 rule in use: ${ruleSummary(s)}${s.scoreOnly ? " \xB7 no filters" : " \xB7 with filters"}`);
  const all = i.samples;
  out.push("", "DATA (recordings on disk)");
  if (!all.length) out.push("- no recordings yet");
  else {
    let first = Infinity;
    let last = 0;
    const kinds = /* @__PURE__ */ new Map();
    for (const x of all) {
      if (x.ts < first) first = x.ts;
      if (x.ts > last) last = x.ts;
      kinds.set(x.kind, (kinds.get(x.kind) ?? 0) + 1);
    }
    const named = { checkpoint: "at fixed moments", entry: "at score levels", signal: "of the rule in use", moment: "at your moments" };
    out.push(`- ${n0(all.length)} recordings over ${((last - first) / HOUR4).toFixed(0)} h (${at(first)} \u2192 ${at(last)}): ${[...kinds].map(([k, v]) => `${n0(v)} ${named[k] ?? k}`).join(", ")}`);
    const rows = recordedRows(all, i.horizonMs);
    out.push(`- finished and usable by the search (followed for ${Math.round(i.horizonMs / HOUR4)} h): ${n0(rows.length)}`);
    const amm = all.filter((x) => x.stage === "amm");
    const poolCut = amm.filter((x) => x.blind !== void 0 && x.blindBy !== "feed").length;
    const feedCut = all.filter((x) => x.blind !== void 0 && x.blindBy === "feed").length;
    const untrusted = amm.filter((x) => x.ov !== 1).length;
    out.push(`- graduated coins: ${share(amm.length, all.length)} of recordings; ${share(poolCut, amm.length)} of those stopped being watched before they ended (the bot follows at most 40 pools)`);
    out.push(`- cut by trade-feed outages: ${share(feedCut, all.length)} of all recordings`);
    if (untrusted) out.push(`- graduated-coin recordings from before observation was tracked (not used): ${n0(untrusted)}`);
    const days = /* @__PURE__ */ new Map();
    for (const x of all) {
      const d = new Date(x.ts).toISOString().slice(0, 10);
      let r2 = days.get(d);
      if (!r2) days.set(d, r2 = { n: 0, amm: 0, pool: 0, feed: 0 });
      r2.n++;
      if (x.stage === "amm") {
        r2.amm++;
        if (x.blind !== void 0 && x.blindBy !== "feed") r2.pool++;
      }
      if (x.blind !== void 0 && x.blindBy === "feed") r2.feed++;
    }
    out.push("- by day (UTC): recordings \xB7 graduated ones cut by pools \xB7 all cut by feed outages");
    for (const [d, r2] of [...days].sort().slice(-8)) out.push(`  ${d} \xB7 ${n0(r2.n)} \xB7 ${share(r2.pool, r2.amm)} \xB7 ${share(r2.feed, r2.n)}`);
    yield;
    out.push("", "ENTRIES ON ALL FINISHED DATA (not proof: the best of 192 exits on everything recorded flatters every entry)");
    const byTag = /* @__PURE__ */ new Map();
    for (const x of rows) {
      let l = byTag.get(x.tag);
      if (!l) byTag.set(x.tag, l = []);
      l.push(x);
    }
    const lines = [];
    for (const [tag, list] of byTag) {
      if (list.length < 30) continue;
      const sum = new Float64Array(EXITS);
      const cnt = new Float64Array(EXITS);
      for (let k = 0; k < list.length; k++) {
        for (let e = 0; e < EXITS; e++) {
          const v = exitReturn(list[k], Math.floor(e / HOLDS_MIN.length), e % HOLDS_MIN.length);
          if (Number.isNaN(v)) continue;
          sum[e] += v;
          cnt[e]++;
        }
        if (k % 1e3 === 999) yield;
      }
      let best = -1;
      for (let e = 0; e < EXITS; e++) if (cnt[e] >= 30 && (best < 0 || sum[e] / cnt[e] > sum[best] / cnt[best])) best = e;
      const span = Math.max(1 / 24, (list[list.length - 1].ts - list[0].ts) / (24 * HOUR4));
      const coins = new Set(list.map((x) => x.mint)).size;
      if (best < 0) lines.push({ v: -Infinity, text: `- ${entryName(tag)} \xB7 ${(coins / span).toFixed(0)}/day \xB7 too few watched to the end` });
      else {
        const mean2 = sum[best] / cnt[best];
        lines.push({ v: mean2, text: `- ${entryName(tag)} \xB7 ${(coins / span).toFixed(0)}/day \xB7 best: ${exitName(best)} \u2192 ${p1(mean2)} per trade on ${n0(cnt[best])}` });
      }
    }
    lines.sort((a, b) => b.v - a.v);
    out.push(...lines.length ? lines.map((l) => l.text) : ["- none with 30 finished recordings yet"]);
  }
  const r = i.report;
  out.push("", "LAST SEARCH (the edge finder)");
  if (!r) out.push("- none yet");
  else {
    out.push(`- ${ago(r.generatedAt, i.now)} \xB7 method ${r.method ?? "old"} \xB7 ${r.status === "ok" ? "answered" : "not enough data"}: ${r.note}`);
    if (r.status === "ok") {
      out.push(`- ${r.hours.toFixed(0)} h of market \xB7 ${n0(r.samples)} recordings \xB7 ${n0(r.tested)} rules tried \xB7 ${r.candidates} candidates re-checked on data it never saw \xB7 ${r.survivors.length} held up`);
      out.push(`- luck check: on shuffled data the same search "found" ${r.placebo.avgSurvivors.toFixed(1)} rules per run (at most ${r.placebo.maxSurvivors})`);
      for (const x of r.survivors.slice(0, 5)) out.push(`  held up: ${x.text} \xB7 ${p1(x.holdout.mean)} per trade on ${x.holdout.n} unseen (worst case ${p1(x.holdout.lo)}) \xB7 ${x.tradesPerDay.toFixed(0)}/day`);
      for (const x of r.failed) out.push(`  closest try: ${x.text} \xB7 ${p1(x.discovery.mean)} while searching (${x.discovery.n}) \u2192 ${p1(x.holdout.mean)} on ${x.holdout.n} unseen (worst case ${p1(x.holdout.lo)})`);
    }
  }
  out.push("", `THE RULE IN USE: ${ruleSummary(s)}`);
  if (all.length) {
    const m = measureRule(recordedRows(all, i.horizonMs), s, { horizonMs: i.horizonMs, tests: r?.status === "ok" ? r.candidates : void 0 });
    out.push(
      m.ok ? `- on the newest recordings (as the search checks candidates): ${p1(m.mean)} per trade on ${n0(m.n)} coins (range ${p1(m.lo)} to ${p1(m.hi)}), ~${m.coinsPerDay.toFixed(0)} coins a day` : `- on the recordings: cannot be weighed \u2014 ${m.why}`
    );
  }
  const mine = i.closed.filter((p) => p.status === "closed" && p.mode === s.mode);
  out.push(`- all ${s.mode} trades: ${trades(mine)}`);
  out.push(`- under this exact rule: ${trades(mine.filter((p) => p.rule === ruleKey(s)))}`);
  const ap = i.autopilot;
  if (ap) {
    out.push("", `AUTOPILOT: ${!s.autopilot ? "off" : ap.holding ? `holding new live entries \u2014 ${ap.holdReason}` : ap.active ? `trading ${ap.active} (since ${at(ap.since)})` : "on your own rule"}`);
    for (const x of ap.log.slice(-6).reverse()) out.push(`- ${at(x.at)}: ${x.what}`);
  }
  out.push("", "CHECKS");
  const checks = [recordedVsReal(i.closed, all, i.now), coverage(all, i.now, false), ...ap ? [decisions(ap, i.now)] : []];
  for (const c of checks) out.push(`- ${c.status === "ok" ? "ok" : c.status} \xB7 ${c.title}: ${c.detail}`);
  return out.join("\n");
}
async function diagnosisAsync(i) {
  const it = steps2(i);
  let t = Date.now();
  for (; ; ) {
    const r = it.next();
    if (r.done) return r.value;
    if (Date.now() - t > 15) {
      await new Promise((res) => setTimeout(res, 0));
      t = Date.now();
    }
  }
}

// src/node/setup.ts
import { exec } from "node:child_process";
import { chmodSync, existsSync as existsSync5, readFileSync as readFileSync5, writeFileSync as writeFileSync2 } from "node:fs";
import { networkInterfaces } from "node:os";
import { join as join3 } from "node:path";

// src/node/store.ts
import {
  closeSync,
  createWriteStream,
  existsSync as existsSync4,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync as readFileSync4,
  readSync,
  readdirSync,
  renameSync,
  rmSync as rmSync2,
  statSync,
  statfsSync,
  writeSync
} from "node:fs";
import { join as join2 } from "node:path";
import { getHeapStatistics } from "node:v8";
import { createGzip, gunzipSync, gzipSync } from "node:zlib";
import { StringDecoder } from "node:string_decoder";
var day = (ts) => new Date(ts).toISOString().slice(0, 10);
var SAMPLE_LIMITS = { checkpoints: 4e4, structural: 2e4, entries: 25e3 };
function sampleScale(heapLimit = getHeapStatistics().heap_size_limit) {
  const gb = heapLimit / 1e9;
  return gb >= 3 ? 3 : gb >= 1.5 ? 2 : 1;
}
function sampleLimits(scale = sampleScale()) {
  return { checkpoints: SAMPLE_LIMITS.checkpoints * scale, structural: SAMPLE_LIMITS.structural * scale, entries: SAMPLE_LIMITS.entries * scale };
}
function autoDataMaxMb(usedMb, freeMb) {
  if (freeMb === null) return 1e4;
  return Math.round(Math.min(1e5, Math.max(1e4, 0.2 * (usedMb + freeMb))));
}
function* forEachLineSteps(path, fn) {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.allocUnsafe(1 << 20);
    const dec = new StringDecoder("utf8");
    let rest = "";
    for (; ; ) {
      const n2 = readSync(fd, buf, 0, buf.length, null);
      if (n2 <= 0) break;
      const lines = (rest + dec.write(buf.subarray(0, n2))).split("\n");
      rest = lines.pop() ?? "";
      for (const l of lines) if (l) fn(l);
      yield;
    }
    rest += dec.end();
    if (rest) fn(rest);
  } finally {
    closeSync(fd);
  }
}
var hour = (ts) => new Date(ts).toISOString().slice(0, 13);
function writeFileAtomic(path, data) {
  const tmp = `${path}.tmp-${process.pid}`;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, typeof data === "string" ? Buffer.from(data) : data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(tmp, path);
      return;
    } catch (e) {
      const code = e.code;
      if (attempt >= 6 || !(code === "EPERM" || code === "EBUSY" || code === "EACCES")) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15 * attempt);
    }
  }
}
var DataStore = class {
  constructor(dir, log) {
    this.log = log;
    this.dir = dir;
    for (const sub of ["", "journal", "samples", "record", "models", "reports"]) mkdirSync(join2(dir, sub), { recursive: true });
    this.flushTimer = setInterval(() => this.flush(), 1e3);
    this.flushTimer.unref?.();
  }
  dir;
  recStream = null;
  recorded = 0;
  /** raw recording is paused while the disk has too little room (enforceBudget) */
  recordingPaused = false;
  journalLines = [];
  sampleLines = [];
  flushTimer = null;
  // ---- state -------------------------------------------------------------------
  saveState(s) {
    writeFileAtomic(join2(this.dir, "state.json"), JSON.stringify(s));
  }
  loadState() {
    for (const name of ["state.json", "state.json.bak"]) {
      const p = join2(this.dir, name);
      if (!existsSync4(p)) continue;
      try {
        const s = JSON.parse(readFileSync4(p, "utf8"));
        if (s && s.v === 1) return s;
      } catch (e) {
        this.log.error(`could not read ${name}`, { err: String(e) });
      }
    }
    return null;
  }
  /** Daily backup copy so a corrupted disk write can never lose everything. */
  backupState() {
    const p = join2(this.dir, "state.json");
    if (existsSync4(p)) {
      try {
        writeFileAtomic(join2(this.dir, "state.json.bak"), readFileSync4(p));
      } catch (e) {
        this.log.warn("state backup failed", { err: String(e) });
      }
    }
  }
  // ---- journal & samples (buffered, flushed every second) ------------------------
  journal(entry) {
    this.journalLines.push(JSON.stringify(entry));
  }
  sample(s) {
    this.sampleLines.push(JSON.stringify(s));
  }
  flush() {
    const now = Date.now();
    try {
      if (this.journalLines.length) {
        const lines = this.journalLines.splice(0);
        appendLines(join2(this.dir, "journal", `${day(now)}.jsonl`), lines);
      }
      if (this.sampleLines.length) {
        const lines = this.sampleLines.splice(0);
        appendLines(join2(this.dir, "samples", `${day(now)}.jsonl`), lines);
      }
    } catch (e) {
      this.log.error("journal/sample flush failed", { err: String(e) });
    }
  }
  /**
   * Labelled samples from the last `days`, oldest first. Files are read newest first and
   * line by line, keeping at most `limits` checkpoints and entries (signal + entry kinds),
   * so memory stays bounded however much has been recorded.
   */
  loadSamples(days, now = Date.now(), limits = sampleLimits()) {
    return runSteps(this.loadSamplesSteps(days, now, limits));
  }
  /** The same, pausing every few milliseconds so trading goes on while days of samples are read. */
  loadSamplesAsync(days, now = Date.now(), limits = sampleLimits()) {
    return runStepsAsync(this.loadSamplesSteps(days, now, limits));
  }
  *loadSamplesSteps(days, now, limits) {
    const cutoff = day(now - days * 864e5);
    let files = [];
    try {
      files = readdirSync(join2(this.dir, "samples")).filter((f2) => f2.endsWith(".jsonl") && f2.slice(0, 10) >= cutoff).sort().reverse();
    } catch {
      return [];
    }
    const perFile = [];
    const cap = { cp: limits.checkpoints, st: limits.structural, en: limits.entries };
    const used = { cp: 0, st: 0, en: 0 };
    const bucketOf = (line) => line.includes('"kind":"moment"') ? "st" : !line.includes('"kind":"checkpoint"') ? "en" : line.includes('"tag":"prog') || line.includes('"tag":"mig') ? "st" : "cp";
    for (const f2 of files) {
      const room = { cp: cap.cp - used.cp, st: cap.st - used.st, en: cap.en - used.en };
      if (room.cp <= 0 && room.st <= 0 && room.en <= 0) break;
      const got = { cp: [], st: [], en: [] };
      try {
        yield* forEachLineSteps(join2(this.dir, "samples", f2), (line) => {
          const b = bucketOf(line);
          if (room[b] <= 0) return;
          let s;
          try {
            s = JSON.parse(line);
          } catch {
            return;
          }
          if (!Array.isArray(s.x) || s.y !== 0 && s.y !== 1) return;
          const into = got[b];
          into.push(s);
          if (into.length >= room[b] * 2) into.splice(0, into.length - room[b]);
        });
      } catch (e) {
        this.log.warn("could not read samples", { file: f2, err: String(e) });
        continue;
      }
      for (const b of ["cp", "st", "en"]) {
        if (got[b].length > room[b]) got[b].splice(0, got[b].length - Math.max(0, room[b]));
        used[b] += got[b].length;
      }
      perFile.push(got.cp.concat(got.st, got.en));
    }
    return perFile.reverse().flat().sort((a, b) => a.ts - b.ts);
  }
  // ---- market recorder (gzip, hourly files) ----------------------------------------
  record(ev, ts) {
    if (this.recordingPaused) return;
    const key = hour(ts);
    if (!this.recStream || this.recStream.key !== key) {
      this.closeRecorder();
      const gz = createGzip({ level: 6 });
      let path = join2(this.dir, "record", `${key}.jsonl.gz`);
      for (let n2 = 2; existsSync4(path); n2++) path = join2(this.dir, "record", `${key}_${String(n2).padStart(2, "0")}.jsonl.gz`);
      const file = createWriteStream(path, { flags: "a" });
      file.on("error", (e) => this.log.error("recorder write failed", { err: String(e) }));
      gz.pipe(file);
      this.recStream = { key, gz, file, path };
    }
    this.recStream.gz.write(JSON.stringify(ev) + "\n");
    this.recorded++;
  }
  closeRecorder() {
    if (this.recStream) {
      this.recStream.gz.end();
      this.recStream = null;
    }
  }
  recordFiles() {
    try {
      return readdirSync(join2(this.dir, "record")).filter((f2) => f2.endsWith(".jsonl.gz")).sort().map((f2) => join2(this.dir, "record", f2));
    } catch {
      return [];
    }
  }
  // ---- models ----------------------------------------------------------------------
  saveModel(m) {
    writeFileAtomic(join2(this.dir, "models", "current.json"), JSON.stringify(m, null, 1));
    const safe = m.version.replace(/[^A-Za-z0-9_.-]/g, "_");
    writeFileAtomic(join2(this.dir, "models", `${safe}.json`), JSON.stringify(m));
    this.pruneModels();
  }
  /** Earlier models are kept for reference, the newest few only (with trees each is ~100 KB). */
  pruneModels(keep = 20) {
    try {
      const dir = join2(this.dir, "models");
      const old = readdirSync(dir).filter((f2) => f2.endsWith(".json") && f2 !== "current.json" && f2 !== "history.json").map((f2) => ({ f: f2, t: statSync(join2(dir, f2)).mtimeMs })).sort((a, b) => b.t - a.t).slice(keep);
      for (const x of old) rmSync2(join2(dir, x.f), { force: true });
    } catch (e) {
      this.log.warn("could not prune old models", { err: String(e) });
    }
  }
  loadModel() {
    const p = join2(this.dir, "models", "current.json");
    if (!existsSync4(p)) return null;
    try {
      const m = JSON.parse(readFileSync4(p, "utf8"));
      return validateModel(m) ? m : null;
    } catch {
      return null;
    }
  }
  /** The self-check's own state (when the last daily check-up went out). */
  saveSelfCheck(state) {
    writeFileAtomic(join2(this.dir, "selfcheck.json"), JSON.stringify(state));
  }
  loadSelfCheck() {
    const p = join2(this.dir, "selfcheck.json");
    if (!existsSync4(p)) return null;
    try {
      return JSON.parse(readFileSync4(p, "utf8"));
    } catch {
      return null;
    }
  }
  /** The autopilot's state: the rule in use, the user's own rule, benched rules, decisions. */
  saveAutopilot(state) {
    writeFileAtomic(join2(this.dir, "autopilot.json"), JSON.stringify(state));
  }
  loadAutopilot() {
    const p = join2(this.dir, "autopilot.json");
    if (!existsSync4(p)) return null;
    try {
      return JSON.parse(readFileSync4(p, "utf8"));
    } catch {
      return null;
    }
  }
  /** The Lab (core/lab): the ideas being tested, their results so far, and the retired ones. */
  saveLab(state) {
    writeFileAtomic(join2(this.dir, "lab.json"), JSON.stringify(state));
  }
  loadLab() {
    const p = join2(this.dir, "lab.json");
    if (!existsSync4(p)) return null;
    try {
      return JSON.parse(readFileSync4(p, "utf8"));
    } catch {
      return null;
    }
  }
  /** What each training run tried and decided (the dashboard's learning history). */
  saveLearnHistory(runs) {
    writeFileAtomic(join2(this.dir, "models", "history.json"), JSON.stringify(runs));
  }
  loadLearnHistory() {
    const p = join2(this.dir, "models", "history.json");
    if (!existsSync4(p)) return [];
    try {
      const runs = JSON.parse(readFileSync4(p, "utf8"));
      return Array.isArray(runs) ? runs : [];
    } catch {
      return [];
    }
  }
  // ---- edge finder -----------------------------------------------------------------
  saveEdges(report) {
    writeFileAtomic(join2(this.dir, "edges.json"), JSON.stringify(report));
  }
  loadEdges() {
    const p = join2(this.dir, "edges.json");
    if (!existsSync4(p)) return null;
    try {
      return JSON.parse(readFileSync4(p, "utf8"));
    } catch {
      return null;
    }
  }
  // ---- wallets ---------------------------------------------------------------------
  saveWallets(snap) {
    writeFileAtomic(join2(this.dir, "wallets.json.gz"), gzipSync(JSON.stringify(snap)));
  }
  loadWallets() {
    const p = join2(this.dir, "wallets.json.gz");
    if (!existsSync4(p)) return null;
    try {
      return JSON.parse(gunzipSync(readFileSync4(p)).toString("utf8"));
    } catch {
      return null;
    }
  }
  // ---- misc --------------------------------------------------------------------------
  readSecret() {
    const p = join2(this.dir, "secret.json");
    if (!existsSync4(p)) return null;
    try {
      return JSON.parse(readFileSync4(p, "utf8")).token ?? null;
    } catch {
      return null;
    }
  }
  writeSecret(token) {
    writeFileAtomic(join2(this.dir, "secret.json"), JSON.stringify({ token }));
  }
  /** Free space on the disk holding the data, MB (null when the system does not say). */
  freeMb() {
    try {
      const st = statfsSync(this.dir);
      return Math.round(Number(st.bavail) * Number(st.bsize) / 1e6);
    } catch {
      return null;
    }
  }
  /** What the data takes, folder by folder, and what the disk has left. */
  storageReport() {
    const byDir = {};
    let total = 0;
    try {
      for (const f2 of readdirSync(this.dir)) {
        const p = join2(this.dir, f2);
        const st = statSync(p);
        const size = st.isDirectory() ? dirBytes(p) : st.size;
        const k = st.isDirectory() ? f2 : "other";
        byDir[k] = (byDir[k] ?? 0) + size / 1e6;
        total += size;
      }
    } catch {
    }
    for (const k of Object.keys(byDir)) byDir[k] = Math.round(byDir[k]);
    return { usedMb: Math.round(total / 1e6), byDir, freeMb: this.freeMb(), recordingPaused: this.recordingPaused };
  }
  /**
   * Keeps the data within `b.maxMb` and at least `b.minFreeMb` of the disk free, deleting, oldest
   * first: raw recordings (only replays use them), then samples older than the newest
   * `b.keepSampleDays` days (training and the searches use the newest ones), then journals older
   * than a week. Trading state, models, the Lab and the autopilot are never touched. When the disk
   * still has too little room, raw recording pauses, and resumes once there is twice the minimum.
   */
  enforceBudget(b, now = Date.now()) {
    const list = (sub) => {
      try {
        return readdirSync(join2(this.dir, sub)).filter((f2) => f2.endsWith(".jsonl") || f2.endsWith(".jsonl.gz")).sort().map((f2) => {
          const p = join2(this.dir, sub, f2);
          return { f: f2, p, mb: statSync(p).size / 1e6 };
        });
      } catch {
        return [];
      }
    };
    let used = dirBytes(this.dir) / 1e6;
    let free = this.freeMb() ?? Infinity;
    let freedMb = 0;
    let deleted = 0;
    let samplesPruned = false;
    const need = () => Math.max(used - b.maxMb, b.minFreeMb - free);
    const del = (x) => {
      try {
        rmSync2(x.p, { force: true });
      } catch {
        return;
      }
      used -= x.mb;
      free += x.mb;
      freedMb += x.mb;
      deleted++;
    };
    for (const x of list("record")) {
      if (need() <= 0) break;
      if (x.p !== this.recStream?.path) del(x);
    }
    const keepSamplesFrom = day(now - (Math.max(1, b.keepSampleDays) - 1) * 864e5);
    for (const x of list("samples")) {
      if (need() <= 0 || x.f.slice(0, 10) >= keepSamplesFrom) break;
      del(x);
      samplesPruned = true;
    }
    const keepJournalFrom = day(now - 6 * 864e5);
    for (const x of list("journal")) {
      if (need() <= 0 || x.f.slice(0, 10) >= keepJournalFrom) break;
      del(x);
    }
    const wasPaused = this.recordingPaused;
    if (free < b.minFreeMb) {
      this.recordingPaused = true;
      this.closeRecorder();
    } else if (wasPaused && free >= 2 * b.minFreeMb) this.recordingPaused = false;
    return { freedMb: Math.round(freedMb), deleted, samplesPruned, paused: !wasPaused && this.recordingPaused, resumed: wasPaused && !this.recordingPaused };
  }
  /** Delete recordings/samples/journals past their retention. */
  cleanup(recordDays, sampleDays, now = Date.now()) {
    const prune = (sub, days) => {
      const cutoff = day(now - days * 864e5);
      try {
        for (const f2 of readdirSync(join2(this.dir, sub))) if (f2.slice(0, 10) < cutoff) rmSync2(join2(this.dir, sub, f2), { force: true });
      } catch {
      }
    };
    prune("record", recordDays);
    prune("samples", sampleDays);
    prune("journal", Math.max(sampleDays, 30));
  }
  diskUsageMb() {
    let total = 0;
    const walk = (d) => {
      try {
        for (const f2 of readdirSync(d)) {
          const p = join2(d, f2);
          const st = statSync(p);
          if (st.isDirectory()) walk(p);
          else total += st.size;
        }
      } catch {
      }
    };
    walk(this.dir);
    return Math.round(total / 1e6);
  }
  close() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flush();
    this.closeRecorder();
  }
};
function appendLines(path, lines) {
  const fd = openSync(path, "a");
  try {
    writeSync(fd, lines.join("\n") + "\n");
  } finally {
    closeSync(fd);
  }
}
function dirBytes(d) {
  let total = 0;
  try {
    for (const f2 of readdirSync(d)) {
      const p = join2(d, f2);
      const st = statSync(p);
      total += st.isDirectory() ? dirBytes(p) : st.size;
    }
  } catch {
  }
  return total;
}

// src/node/setup.ts
var SETUP_KEYS = [
  "RPC_URL",
  "RPC_WS_URL",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_LINK_CODE",
  "LIVE_TRADING",
  "WALLET_PRIVATE_KEY",
  "LIVE_MAX_POSITION_SOL",
  "LIVE_MAX_DAILY_LOSS_SOL",
  "STREAM_SOURCE",
  "STREAM_BUDGET_MB_PER_DAY"
];
var LIVE_PHRASE = "I_UNDERSTAND_THE_RISK";
var SetupStore = class {
  path;
  constructor(dataDir) {
    this.path = join3(dataDir, "config.json");
  }
  read() {
    if (!existsSync5(this.path)) return {};
    try {
      const raw = JSON.parse(readFileSync5(this.path, "utf8"));
      const out = {};
      for (const k of SETUP_KEYS) if (typeof raw[k] === "string") out[k] = raw[k];
      return out;
    } catch {
      return {};
    }
  }
  /** Merges `patch` in; an empty string removes a value (the .env / host value applies again). */
  write(patch) {
    const next = { ...this.read() };
    for (const [k, v] of Object.entries(patch)) {
      if (!SETUP_KEYS.includes(k) || v === void 0) continue;
      if (v === "") delete next[k];
      else next[k] = v;
    }
    writeFileAtomic(this.path, JSON.stringify(next, null, 1));
    try {
      chmodSync(this.path, 384);
    } catch {
    }
  }
  /** Values chosen in the dashboard win over .env and the host's variables. */
  applyTo(env) {
    for (const [k, v] of Object.entries(this.read())) if (v) env[k] = v;
  }
};
function rpcFromInput(input) {
  const v = input.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    return { http: `https://mainnet.helius-rpc.com/?api-key=${v}`, ws: `wss://mainnet.helius-rpc.com/?api-key=${v}` };
  }
  try {
    const u = new URL(v);
    if (u.protocol === "https:" || u.protocol === "http:") return { http: u.toString(), ws: u.toString().replace(/^http/i, "ws") };
    if (u.protocol === "wss:" || u.protocol === "ws:") return { http: u.toString().replace(/^ws/i, "http"), ws: u.toString() };
  } catch {
  }
  return null;
}
function telegramTokenLooksValid(token) {
  return /^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token.trim());
}
function newLinkCode() {
  return String(1e5 + Math.floor(Math.random() * 9e5));
}
function isLocalRequest(req) {
  const addr = req.socket.remoteAddress ?? "";
  if (!(addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1")) return false;
  if (req.headers["x-forwarded-for"] || req.headers.forwarded) return false;
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(String(req.headers.host ?? ""));
}
function isPrivateChannel(req) {
  return isLocalRequest(req) || req.headers["x-forwarded-proto"] === "https" || !!req.socket.encrypted;
}
function ipv4(ifaces) {
  return Object.values(ifaces).flat().filter((i) => !!i && i.family === "IPv4" && !i.internal).map((i) => i.address);
}
var isTailscale = (a) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a);
function lanAddress(ifaces = networkInterfaces()) {
  const v4 = ipv4(ifaces).filter((a) => !isTailscale(a));
  return v4.find((a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a)) ?? v4[0] ?? null;
}
function tailscaleAddress(ifaces = networkInterfaces()) {
  return ipv4(ifaces).find(isTailscale) ?? null;
}
function openBrowser(url, dataDir) {
  const stamp = join3(dataDir, ".browser-opened");
  try {
    if (existsSync5(stamp) && Date.now() - Number(readFileSync5(stamp, "utf8")) < 10 * 6e4) return;
    writeFileSync2(stamp, String(Date.now()));
  } catch {
  }
  const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {
  });
}

// src/node/server.ts
var MAX_BODY = 64 * 1024;
var DashboardServer = class {
  constructor(ctx) {
    this.ctx = ctx;
    this.session = createHmac("sha256", ctx.token).update("signal-session-v1").digest("hex");
    this.api = {
      engine: ctx.engine,
      samples: (days) => this.cachedSamples(days),
      health: () => this.healthPayload(),
      learnRun: () => ctx.learner.run(),
      live: {
        status: () => ctx.live()?.status() ?? null,
        resume: () => ctx.live()?.resume(),
        allowed: () => ctx.config.liveTrading && !!ctx.live()?.ready()
      },
      logs: () => ctx.log.tail.toArray().slice(-200).reverse(),
      edges: () => ctx.learner.lastEdges ? { ...ctx.learner.lastEdges, running: ctx.learner.edgesRunning } : null,
      edgesRun: () => ctx.learner.findEdges(),
      learning: () => this.learning(),
      autopilot: () => ctx.learner.autopilotView(),
      checks: () => ctx.learner.checksView(),
      lab: () => ctx.learner.labView(),
      labSummary: () => ctx.learner.labSummary(),
      diagnosis: async () => {
        const e = ctx.engine();
        const l = ctx.learner;
        return diagnosisAsync({
          samples: await this.cachedSamples(14),
          settings: e.settings,
          closed: e.closed.toArray(),
          autopilot: l.autopilot,
          report: l.lastEdges,
          now: Date.now(),
          horizonMs: e.cfg.outcomeHorizonMs,
          version: ctx.updater?.current ?? void 0
        });
      },
      labIdea: (text) => ctx.learner.addLabIdea(text),
      onSettingsChanged: () => {
        const s = ctx.engine().settings;
        ctx.log.info("settings updated", { minScore: s.minScore, scoreOnly: s.scoreOnly, tp: s.tpPct, sl: s.slPct, enabled: s.enabled, mode: s.mode });
      }
    };
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((e) => {
        ctx.log.error("http handler error", { err: String(e), url: req.url });
        if (!res.headersSent) this.json(res, 500, { error: "internal error" });
        else res.end();
      });
    });
    this.server.keepAliveTimeout = 65e3;
    this.server.headersTimeout = 7e4;
  }
  server;
  clients = /* @__PURE__ */ new Set();
  nextId = 1;
  loginHits = /* @__PURE__ */ new Map();
  timers = [];
  session;
  csp = "";
  api;
  sampleCache = null;
  sampleCacheTimer = null;
  /**
   * The Learn tab refreshes every minute; reading days of samples from disk each time is wasteful.
   * Reads pause often (trading goes on meanwhile), and requests that arrive during one share it.
   */
  cachedSamples(days) {
    const c = this.sampleCache;
    if (c && c.days === days && Date.now() - c.at < 5 * 6e4) return c.data;
    const data = this.ctx.store.loadSamplesAsync(days);
    this.sampleCache = { days, at: Date.now(), data };
    data.catch(() => {
      if (this.sampleCache?.data === data) this.sampleCache = null;
    });
    if (this.sampleCacheTimer) clearTimeout(this.sampleCacheTimer);
    this.sampleCacheTimer = setTimeout(() => this.sampleCache = null, 6 * 6e4);
    this.sampleCacheTimer.unref?.();
    return data;
  }
  learningCache = null;
  /** What the scoring model learned (Learn tab, Telegram /learn); rebuilt at most every 30 s. */
  learning() {
    const e = this.ctx.engine();
    const l = this.ctx.learner;
    const key = `${e.model.version}|${l.lastRun}|${l.running}`;
    const c = this.learningCache;
    if (c && c.key === key && Date.now() - c.at < 3e4) return c.view;
    const model = e.model;
    const view = this.cachedSamples(14).then(
      (samples) => learningViewAsync(model, {
        recent: samples.length ? samples : e.samples.toArray(),
        horizonMs: e.cfg.outcomeHorizonMs,
        history: l.history.slice(-20),
        status: { running: l.running, lastRun: l.lastRun, nextRun: l.nextRun, lastError: l.lastError, everyHours: this.ctx.config.learnEveryHours }
      })
    );
    this.learningCache = { at: Date.now(), key, view };
    view.catch(() => {
      if (this.learningCache?.view === view) this.learningCache = null;
    });
    return view;
  }
  listen(port, host) {
    return new Promise((resolve3, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, host, () => {
        this.server.off("error", reject);
        resolve3();
      });
    }).then(() => {
      this.timers.push(setInterval(() => this.pushRadar(), 2e3));
      this.timers.push(setInterval(() => this.broadcast("health", this.healthPayload()), 5e3));
      this.timers.push(setInterval(() => this.heartbeat(), 15e3));
    });
  }
  get address() {
    return this.server.address();
  }
  close() {
    for (const t of this.timers) clearInterval(t);
    if (this.sampleCacheTimer) clearTimeout(this.sampleCacheTimer);
    for (const c of this.clients) c.res.end();
    this.clients.clear();
    this.server.close();
  }
  // -------------------------------------------------------------------------------
  broadcast(event, data) {
    if (this.clients.size === 0) return;
    let payload;
    try {
      payload = `event: ${event}
data: ${JSON.stringify(data)}

`;
    } catch {
      return;
    }
    for (const c of [...this.clients]) {
      try {
        c.res.write(payload);
      } catch {
        this.clients.delete(c);
      }
    }
  }
  heartbeat() {
    for (const c of [...this.clients]) {
      try {
        c.res.write(`: keep-alive ${Date.now()}

`);
      } catch {
        this.clients.delete(c);
      }
    }
  }
  pushRadar() {
    if (this.clients.size === 0) return;
    const e = this.ctx.engine();
    this.broadcast("radar", { rows: e.radar({ limit: 80 }), account: this.accountSummary() });
  }
  accountSummary() {
    return accountSummary(this.ctx.engine());
  }
  healthPayload() {
    const e = this.ctx.engine();
    return {
      ...e.health(),
      config: describeConfig(this.ctx.config),
      live: this.ctx.live()?.status() ?? null,
      recorded: this.ctx.store.recorded,
      ...this.ctx.extraHealth(),
      learner: { lastRun: this.ctx.learner.lastRun, running: this.ctx.learner.running, lastError: this.ctx.learner.lastError, reports: this.ctx.learner.lastReports }
    };
  }
  // -------------------------------------------------------------------------------
  authed(req) {
    if (isLocalRequest(req)) return true;
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ") && safeEq(auth.slice(7).trim(), this.ctx.token)) return true;
    const cookie = req.headers.cookie ?? "";
    const m = /(?:^|;\s*)signal_session=([a-f0-9]{64})/.exec(cookie);
    return !!m && safeEq(m[1], this.session);
  }
  setSession(req, res) {
    const secure = req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted;
    res.setHeader("set-cookie", `signal_session=${this.session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 24 * 60}${secure ? "; Secure" : ""}`);
  }
  json(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(text);
  }
  async body(req) {
    return new Promise((resolve3, reject) => {
      let size = 0;
      const chunks = [];
      req.on("data", (c) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(new Error("body too large"));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => {
        try {
          resolve3(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
        } catch {
          resolve3({});
        }
      });
      req.on("error", reject);
    });
  }
  ip(req) {
    const fwd = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
    return fwd || req.socket.remoteAddress || "?";
  }
  loginAllowed(ip) {
    const now = Date.now();
    const hits = (this.loginHits.get(ip) ?? []).filter((t) => now - t < 6e4);
    hits.push(now);
    this.loginHits.set(ip, hits);
    if (this.loginHits.size > 5e3) this.loginHits.clear();
    return hits.length <= 10;
  }
  page(res) {
    const html = this.ctx.dashboardHtml();
    if (!this.csp) {
      const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
      this.csp = [
        "default-src 'self'",
        `script-src 'self' ${hashes.join(" ")}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "font-src 'self' data:",
        "base-uri 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'"
      ].join("; ");
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
      "content-security-policy": this.csp,
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff"
    });
    res.end(html);
  }
  async handle(req, res) {
    const url = new URL(req.url ?? "/", "http://local");
    const path = url.pathname;
    const method = req.method ?? "GET";
    if (path === "/healthz") return this.json(res, 200, { ok: true, app: "signal", uptime: process.uptime() });
    if (method === "GET" && (path === "/" || path === "/index.html")) {
      const t = url.searchParams.get("token");
      if (t) {
        if (this.loginAllowed(this.ip(req)) && safeEq(t, this.ctx.token)) {
          this.setSession(req, res);
          res.writeHead(302, { location: "/" });
          return res.end();
        }
      }
      return this.page(res);
    }
    if (path === "/api/login" && method === "POST") {
      if (!this.loginAllowed(this.ip(req))) return this.json(res, 429, { error: "Too many attempts \u2014 wait a minute." });
      const b = await this.body(req);
      if (typeof b.token === "string" && safeEq(b.token.trim(), this.ctx.token)) {
        this.setSession(req, res);
        return this.json(res, 200, { ok: true });
      }
      return this.json(res, 401, { error: "Wrong access token." });
    }
    if (!path.startsWith("/api/")) {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("not found");
    }
    if (!this.authed(req)) return this.json(res, 401, { error: "login required" });
    if (method === "POST" && req.headers["x-signal"] !== "1") return this.json(res, 403, { error: "missing x-signal header" });
    if (method === "GET") {
      if (path === "/api/stream") return this.stream(req, res);
      if (path === "/api/export/samples") return this.exportFiles(res, "samples", "signal-samples.jsonl");
      if (path === "/api/export/journal") return this.exportFiles(res, "journal", "signal-journal.jsonl");
    }
    const raw = method === "POST" ? await this.body(req) : {};
    const body = raw && typeof raw === "object" ? raw : {};
    if (path === "/api/setup" && method === "GET") return this.json(res, 200, this.setupStatus(req));
    if (path.startsWith("/api/setup/") || path === "/api/restart") {
      if (method !== "POST") return this.json(res, 405, { error: "method not allowed" });
      const r2 = await this.setupAction(req, path, body);
      return this.json(res, r2.status, r2.json);
    }
    const r = await handleApi(this.api, method, path, url.searchParams, body);
    return this.json(res, r.status, r.json);
  }
  // ---- setup from the dashboard ----------------------------------------------------
  setupStatus(req) {
    const eff = this.ctx.effective;
    const rpcUrl = eff("RPC_URL") || this.ctx.config.rpcHttp;
    let host = "";
    try {
      host = new URL(rpcUrl).host;
    } catch {
      host = "invalid";
    }
    const feed = this.ctx.engine().health().feeds.find((f2) => f2.name === "solana-rpc");
    const up = Math.max(120, process.uptime());
    const perDay = (bytes) => bytes ? bytes / 1e6 * (86400 / up) : null;
    const tgToken = eff("TELEGRAM_BOT_TOKEN");
    const tgChat = eff("TELEGRAM_CHAT_ID");
    let address = null;
    const key = eff("WALLET_PRIVATE_KEY");
    if (key) {
      try {
        address = parseWalletSecret(key).address;
      } catch {
        address = null;
      }
    }
    const lan = lanAddress();
    const tailnet = tailscaleAddress();
    const num3 = (k, d) => Number.isFinite(Number(eff(k))) && eff(k) !== "" ? Number(eff(k)) : d;
    return {
      supervised: process.env.SIGNAL_SUPERVISED === "1",
      local: isLocalRequest(req),
      privateChannel: isPrivateChannel(req),
      rpc: {
        host,
        isPublic: isPublicRpc(rpcUrl)
      },
      stream: {
        /** running now */
        source: this.ctx.config.streamSource,
        /** saved choice (applies after a restart) */
        chosen: eff("STREAM_SOURCE") === "rpc" ? "rpc" : "public",
        budgetMb: this.ctx.config.streamBudgetMb,
        ammFirehose: this.ctx.config.ammFirehose,
        feed: feed ? {
          host: feed.host ?? "",
          status: feed.status,
          msgs: feed.msgs,
          mbPerDay: perDay(feed.bytes),
          netMbPerDay: perDay(feed.wire),
          budget: feed.budget ?? null
        } : null
      },
      telegram: {
        tokenSet: !!tgToken && tgToken !== "off",
        linked: !!tgChat && tgChat !== "none",
        code: !tgChat || tgChat === "none" ? this.ctx.setup.read().TELEGRAM_LINK_CODE ?? null : null
      },
      live: {
        enabled: this.ctx.config.liveTrading,
        pendingRestart: eff("LIVE_TRADING") === LIVE_PHRASE !== this.ctx.config.liveTrading,
        walletSet: !!address,
        address,
        maxPositionSol: num3("LIVE_MAX_POSITION_SOL", 0.05),
        maxDailyLossSol: num3("LIVE_MAX_DAILY_LOSS_SOL", 0.25),
        ready: !!this.ctx.live()?.ready()
      },
      phoneUrl: lan ? `http://${lan}:${this.ctx.port}/?token=${this.ctx.token}` : null,
      anywhereUrl: tailnet ? `http://${tailnet}:${this.ctx.port}/?token=${this.ctx.token}` : null,
      update: this.ctx.updater?.status() ?? null
    };
  }
  async setupAction(req, path, body) {
    const fail = (status, error) => ({ status, json: { error } });
    const done = (extra = {}) => ({ status: 200, json: { ok: true, ...extra } });
    const restartNote = (restarting) => restarting ? {} : { note: "Saved. Close the bot window and start it again to apply." };
    switch (path) {
      case "/api/setup/rpc": {
        const r = rpcFromInput(String(body.key ?? ""));
        if (!r) return fail(400, "Paste your Helius API key (it looks like 1a2b3c4d-5e6f-\u2026) or a full RPC address.");
        const test = await postJson(r.http, { jsonrpc: "2.0", id: 1, method: "getSlot" }, { timeoutMs: 1e4 });
        if (!test.ok || typeof test.json?.result !== "number") {
          return fail(400, `That key did not work (${test.status ? `error ${test.status}` : "no answer"}). Copy it again from your Helius dashboard.`);
        }
        this.ctx.setup.write({ RPC_URL: r.http, RPC_WS_URL: r.ws });
        this.ctx.log.info("data feed changed from the dashboard", { host: new URL(r.http).host });
        const restarting = this.ctx.restart();
        return done({ slot: test.json.result, restarting, ...restartNote(restarting) });
      }
      case "/api/setup/stream": {
        const source = body.source === "rpc" ? "rpc" : "public";
        const budget = Math.round(Number(body.budgetMb ?? this.ctx.config.streamBudgetMb));
        if (source === "rpc" && isPublicRpc(this.ctx.effective("RPC_WS_URL") || this.ctx.config.rpcWs)) return fail(400, "Add your RPC key first (step 1), then choose to stream through it.");
        if (!(budget >= 50 && budget <= 1e5)) return fail(400, "The daily cap must be between 50 and 100,000 MB.");
        this.ctx.setup.write({ STREAM_SOURCE: source, STREAM_BUDGET_MB_PER_DAY: String(budget) });
        this.ctx.log.info("market data source changed from the dashboard", { source, budget });
        const restarting = this.ctx.restart();
        return done({ restarting, ...restartNote(restarting) });
      }
      case "/api/setup/telegram": {
        const token = String(body.token ?? "").trim();
        if (!telegramTokenLooksValid(token)) return fail(400, "Paste the token @BotFather gave you (it looks like 123456789:AAH\u2026).");
        const me = await getJson(`https://api.telegram.org/bot${token}/getMe`, { timeoutMs: 1e4 });
        if (!me?.ok) return fail(400, "Telegram did not accept that token. Copy it again from @BotFather.");
        const code = newLinkCode();
        this.ctx.setup.write({ TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: "none", TELEGRAM_LINK_CODE: code });
        this.ctx.reloadTelegram();
        return done({ bot: me.result?.username ?? null, code });
      }
      case "/api/setup/telegram-off":
        this.ctx.setup.write({ TELEGRAM_BOT_TOKEN: "off", TELEGRAM_CHAT_ID: "none", TELEGRAM_LINK_CODE: "" });
        this.ctx.reloadTelegram();
        return done();
      case "/api/setup/live": {
        if (!isPrivateChannel(req)) return fail(403, `For safety, add the wallet on the computer running the bot: open http://localhost:${this.ctx.port} there.`);
        if (String(body.confirm ?? "").trim().toUpperCase().replace(/\s+/g, "_") !== LIVE_PHRASE) return fail(400, 'Type "I understand the risk" to confirm.');
        const maxPos = Number(body.maxPositionSol);
        const maxLoss = Number(body.maxDailyLossSol);
        if (!(maxPos > 0 && maxPos <= 10)) return fail(400, "Max per trade must be between 0 and 10 SOL.");
        if (!(maxLoss > 0 && maxLoss <= 100)) return fail(400, "Max loss per day must be between 0 and 100 SOL.");
        const key = String(body.walletKey ?? "").trim();
        let address;
        try {
          address = parseWalletSecret(key || this.ctx.effective("WALLET_PRIVATE_KEY")).address;
        } catch {
          return fail(400, key ? "That is not a Solana private key. In Phantom: Settings \u2192 Manage accounts \u2192 your bot wallet \u2192 Show private key." : "Paste the bot wallet's private key.");
        }
        this.ctx.setup.write({
          LIVE_TRADING: LIVE_PHRASE,
          ...key ? { WALLET_PRIVATE_KEY: key } : {},
          LIVE_MAX_POSITION_SOL: String(maxPos),
          LIVE_MAX_DAILY_LOSS_SOL: String(maxLoss)
        });
        this.ctx.log.warn("live trading enabled from the dashboard", { wallet: address, maxPos, maxLoss });
        const restarting = this.ctx.restart();
        return done({ address, restarting, ...restartNote(restarting) });
      }
      case "/api/setup/live-off": {
        const e = this.ctx.engine();
        e.updateSettings({ mode: "paper" });
        e.persistNow();
        this.ctx.setup.write({ LIVE_TRADING: "off" });
        this.ctx.log.warn("live trading switched off from the dashboard");
        const restarting = this.ctx.restart();
        return done({ restarting, ...restartNote(restarting) });
      }
      case "/api/setup/wallet-remove": {
        if (!isPrivateChannel(req)) return fail(403, `Remove the wallet on the computer running the bot: open http://localhost:${this.ctx.port} there.`);
        const e = this.ctx.engine();
        e.updateSettings({ mode: "paper" });
        e.persistNow();
        this.ctx.setup.write({ LIVE_TRADING: "off", WALLET_PRIVATE_KEY: "" });
        const restarting = this.ctx.restart();
        return done({ restarting, ...restartNote(restarting) });
      }
      case "/api/setup/update-check": {
        const u = this.ctx.updater;
        if (!u) return fail(400, "Updates are not available here.");
        return done({ update: await u.check() });
      }
      case "/api/setup/update": {
        const u = this.ctx.updater;
        if (!u) return fail(400, "Updates are not available here.");
        const r = await u.apply();
        if (!r.ok) return fail(u.can ? 502 : 400, r.error);
        if (r.upToDate) return done({ upToDate: true, note: "SIGNAL is already up to date." });
        return done({ version: r.version, restarting: r.restarting, ...restartNote(r.restarting) });
      }
      case "/api/restart": {
        const restarting = this.ctx.restart();
        return restarting ? done({ restarting }) : fail(400, "This bot was started without its starter, so it cannot restart itself. Close it and start it again.");
      }
      default:
        return fail(404, "unknown endpoint");
    }
  }
  stream(req, res) {
    if (this.clients.size >= 25) return this.json(res, 503, { error: "too many live connections" });
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });
    res.write("retry: 3000\n\n");
    const c = { res, id: this.nextId++ };
    this.clients.add(c);
    const e = this.ctx.engine();
    res.write(`event: hello
data: ${JSON.stringify({ settings: e.settings, account: this.accountSummary(), rows: e.radar({ limit: 80 }), serverTime: Date.now() })}

`);
    req.on("close", () => this.clients.delete(c));
  }
  exportFiles(res, sub, name) {
    res.writeHead(200, { "content-type": "application/x-ndjson", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" });
    try {
      const dir = join4(this.ctx.store.dir, sub);
      for (const f2 of readdirSync2(dir).filter((x) => x.endsWith(".jsonl")).sort()) res.write(readFileSync6(join4(dir, f2)));
    } catch {
    }
    res.end();
  }
};
function safeEq(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// src/node/telegram.ts
var esc = (s) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);
var sol = (lamports) => (lamports / 1e9).toFixed(3);
var Telegram = class {
  constructor(o) {
    this.o = o;
  }
  queue = [];
  sending = false;
  offset = 0;
  stopped = false;
  lastSendAt = 0;
  get enabled() {
    return !!(this.o.token && this.o.token !== "off" && this.o.chatId);
  }
  /** Waiting for the owner to send the link code shown in the dashboard. */
  get linking() {
    return !!(this.o.token && this.o.token !== "off" && !this.o.chatId && this.o.linkCode);
  }
  start() {
    if (!this.enabled && !this.linking) return;
    this.stopped = false;
    void this.poll();
    if (this.enabled) this.send(this.startedMessage());
  }
  stop() {
    this.stopped = true;
  }
  send(html) {
    if (!this.enabled) return;
    this.queue.push(html);
    if (this.queue.length > 50) this.queue.splice(0, this.queue.length - 50);
    void this.drain();
  }
  async drain() {
    if (this.sending) return;
    this.sending = true;
    try {
      while (this.queue.length) {
        const wait = 1100 - (Date.now() - this.lastSendAt);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        const text = this.queue.shift();
        const res = await postJson(`https://api.telegram.org/bot${this.o.token}/sendMessage`, {
          chat_id: this.o.chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
        this.lastSendAt = Date.now();
        if (!res.ok) this.o.log.warn("telegram send failed", { status: res.status });
      }
    } finally {
      this.sending = false;
    }
  }
  async poll() {
    while (!this.stopped) {
      const r = await getJson(
        `https://api.telegram.org/bot${this.o.token}/getUpdates?timeout=25&offset=${this.offset}`,
        { timeoutMs: 35e3 }
      );
      if (!r?.ok) {
        await new Promise((res) => setTimeout(res, 5e3));
        continue;
      }
      for (const u of r.result ?? []) {
        this.offset = Math.max(this.offset, u.update_id + 1);
        const chat = String(u.message?.chat?.id ?? "");
        const text = (u.message?.text ?? "").trim();
        if (!text || !chat) continue;
        if (!this.o.chatId) {
          this.link(chat, text);
          continue;
        }
        if (chat !== String(this.o.chatId)) continue;
        try {
          this.send(await this.reply(text));
        } catch (e) {
          this.send(`\u26A0\uFE0F ${esc(String(e))}`);
        }
      }
    }
  }
  /** Link mode: the first chat that sends the dashboard's code becomes the owner. */
  link(chat, text) {
    if (this.o.linkCode && text.includes(this.o.linkCode)) {
      this.o.chatId = chat;
      this.o.onLinked?.(chat);
      this.send("\u2705 <b>Linked.</b> SIGNAL will message you here about every trade.\nSend /help for commands.");
      return;
    }
    void postJson(`https://api.telegram.org/bot${this.o.token}/sendMessage`, {
      chat_id: chat,
      text: "To link this chat, send the 6-digit code shown in the SIGNAL dashboard (More \u2192 Setup)."
    });
  }
  /** The greeting after every start: after an update it shows the new version at once. */
  startedMessage() {
    const a = this.o.about?.();
    const s = this.o.engine().settings;
    return [
      `\u{1F7E2} <b>SIGNAL started</b>${a?.version ? ` \xB7 v ${esc(a.version.slice(0, 7))}` : ""}`,
      a?.data ? `Market data: ${esc(a.data)}` : "",
      `${s.enabled ? "\u25B6\uFE0F Trading" : "\u23F8 Paused"} \xB7 ${s.mode} \xB7 ${ruleSummary(s)}`,
      "Send /help for commands."
    ].filter(Boolean).join("\n");
  }
  /** The reply to a chat message: commands that need a moment of work (reading outcomes) are awaited. */
  async reply(text) {
    if (text.split(/\s+/)[0].toLowerCase().replace(/@.*/, "") === "/learn") {
      const v = await this.o.learning?.();
      return v ? learningMessage(v) : "Learning is not available here.";
    }
    return this.command(text);
  }
  /** Execute a chat command and return the reply (exported behaviour is tested). */
  command(text) {
    const e = this.o.engine();
    const [cmd, arg, extra] = text.split(/\s+/);
    const n2 = arg !== void 0 ? Number(arg) : NaN;
    const byHand = (patch) => {
      const before = e.settings;
      e.updateSettings(patch);
      return before.autopilot && e.settings.autopilot && ruleChanged(before, e.settings) ? "\n\u{1F916} The autopilot stays on: it keeps your rule unless a proven rule does clearly better (/autopilot off to trade it no matter what)." : "";
    };
    switch (cmd.toLowerCase().replace(/@.*/, "")) {
      case "/start":
      case "/help":
        return [
          "<b>SIGNAL commands</b>",
          "/status \u2014 bot, P&amp;L, market data, version",
          "/strategy \u2014 list the strategies \xB7 /strategy 2 \u2014 switch to one",
          "/edges \u2014 has the bot found an edge? (checked every 2 h)",
          "/learn \u2014 what the score learned, and is it still working?",
          "/autopilot on|off \u2014 trade the best proven rule by itself",
          "/checks \u2014 is everything working as it should?",
          "/lab \u2014 rules the bot invented, proven only on coins after them",
          "/idea mig300 top10&lt;=25% smart&gt;=1 tp100 sl30 hold30 \u2014 test your own rule",
          "/positions \u2014 open trades",
          "/pause \xB7 /resume \u2014 auto-trading off/on",
          "/score 75 \u2014 minimum score",
          "/tp 100 \xB7 /sl 50 \u2014 take profit / stop loss %",
          "/hold 10 \u2014 sell after N minutes (0 = no limit)",
          "/size 0.1 \u2014 SOL per trade",
          "/scoreonly on|off \u2014 trade on score alone",
          "/kill \u2014 stop entries and sell everything \xB7 /unkill",
          "/update \u2014 install the newest version of SIGNAL",
          "/link \u2014 open the dashboard on this phone"
        ].join("\n");
      case "/status": {
        const a = e.account();
        const h = e.health();
        const s = e.settings;
        const about = this.o.about?.();
        const main2 = h.feeds.find((f2) => f2.critical && f2.status !== "off");
        const data = h.feedDown ? `\u{1F534} Market data down${main2?.note ? `: ${esc(main2.note)}` : ""} \u2014 no new trades until it is back` : `\u{1F7E2} Market data${about?.data ? `: ${esc(about.data)}` : ""}${main2?.lastMsgAt ? ` \xB7 last message ${Math.max(0, Math.round((Date.now() - main2.lastMsgAt) / 1e3))} s ago` : ""}`;
        return [
          `<b>${s.enabled ? "\u25B6\uFE0F Trading" : "\u23F8 Paused"}</b> \xB7 ${s.mode.toUpperCase()}${e.killed ? " \xB7 KILL SWITCH" : ""}`,
          `Score \u2265 ${s.minScore}${s.scoreOnly ? " (score only)" : ""} \xB7 TP ${s.tpPct}% \xB7 SL ${s.slPct}% \xB7 ${s.maxHoldMin > 0 ? `sell after ${s.maxHoldMin} min` : "no time limit"} \xB7 ${s.positionSol} SOL`,
          autopilotLine(this.o.autopilot?.() ?? null, s.autopilot),
          this.o.checks?.() ? `\u{1FA7A} Self-check: ${this.o.checks().summary} (/checks)` : "",
          `Today ${sol(a.dayPnl)} SOL \xB7 total ${sol(a.realized)} SOL \xB7 ${a.wins}W/${a.losses}L`,
          `Open ${a.open.length}/${s.maxOpen}`,
          data,
          about?.version ? `v ${esc(about.version.slice(0, 7))}${about.update ? " \xB7 \u2B06\uFE0F update ready \u2014 send /update" : ""}` : ""
        ].filter(Boolean).join("\n");
      }
      case "/lab": {
        const v = this.o.lab?.();
        if (!v) return "The Lab is not available here.";
        const pct4 = (x) => x === null || !Number.isFinite(x) ? "\u2014" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
        const lines = [`\u{1F9EA} <b>Lab</b> \u2014 ${esc(v.note)}`];
        for (const i of v.proven) lines.push(`\u2705 ${esc(i.text)}: ${pct4(i.mean)} per trade on ${i.n} coins after it (worst case ${pct4(i.proof?.lo ?? null)})`);
        for (const i of v.testing.slice(0, 8))
          lines.push(`\u{1F52C} ${esc(i.code)}: ${i.n ? `${i.n} coins, ${pct4(i.mean)} per trade` : "waiting for coins"}${i.nextLook ? ` \xB7 judged at ${i.nextLook}` : ""}${i.source === "you" ? " \xB7 yours" : ""}`);
        if (v.retired.length) lines.push(`Retired lately: ${v.retired.length} (last: ${esc(v.retired[0].why ?? "")})`);
        lines.push("Add your own: /idea mig300 top10&lt;=25% smart&gt;=1 tp100 sl30 hold30");
        return lines.join("\n");
      }
      case "/idea": {
        if (!this.o.labIdea) return "The Lab is not available here.";
        const rule = text.trim().slice(cmd.length).trim();
        const r = this.o.labIdea(rule);
        return r.ok ? `\u{1F9EA} ${esc(r.note)}` : `\u26A0\uFE0F ${esc(r.error)}`;
      }
      case "/checks": {
        const v = this.o.checks?.();
        if (!v || !v.checks.length) return "The self-check has not run yet (it runs every 10 minutes).";
        const icon = { ok: "\u2705", info: "\u2139\uFE0F", warn: "\u26A0\uFE0F", fail: "\u{1F6D1}" };
        return [`\u{1FA7A} <b>Self-check</b>: ${v.summary}`, ...v.checks.map((c) => `${icon[c.status]} <b>${esc(c.title)}</b> \u2014 ${esc(c.detail)}`)].join("\n");
      }
      case "/autopilot": {
        const want = arg?.toLowerCase();
        if (want === "on" || want === "off") {
          if (e.settings.mode === "live" && want === "on" && extra?.toLowerCase() !== "yes")
            return "You are trading LIVE. The autopilot switches the rule by itself (never the size or the limits) and waits while no rule is proven for real money. Send /autopilot on yes to turn it on.";
          e.updateSettings({ autopilot: want === "on" });
          return want === "on" ? "\u{1F916} Autopilot is on: it trades the best rule proven on data the search never saw, and switches when a clearly better one is proven. A rule you pick yourself competes too: it stays unless a proven rule does clearly better." : "Autopilot is off: the rule stays as it is now. Change it with /strategy or in the Bot tab.";
        }
        return autopilotMessage(this.o.autopilot?.() ?? null, e.settings.autopilot);
      }
      case "/strategy":
      case "/strategies": {
        const list = this.o.strategies?.() ?? [];
        if (!list.length) return "No strategies here.";
        if (arg === void 0) {
          return [
            "<b>Strategies</b> \u2014 each sets the whole rule. Send /strategy 1, /strategy 2\u2026 to switch:",
            ...list.map(
              (p2, i) => `${i + 1}. ${followsPreset(e.settings, p2.settings) ? "\u2705 " : ""}<b>${esc(p2.name)}</b>${p2.proof === "unproven" ? " (unproven)" : ""} \u2014 ${ruleSummary({ ...e.settings, ...p2.settings })}`
            )
          ].join("\n");
        }
        const pick2 = Number(arg);
        if (!Number.isInteger(pick2) || pick2 < 1 || pick2 > list.length) return `Send a number from 1 to ${list.length}, or /strategy to see them.`;
        const p = list[pick2 - 1];
        if (e.settings.mode === "live" && extra?.toLowerCase() !== "yes") return `You are trading LIVE. Send /strategy ${pick2} yes to switch to ${esc(p.name)}.`;
        const off = byHand(p.settings);
        return `${e.settings.enabled ? "\u25B6\uFE0F Now trading" : "Strategy set (auto-trading is paused \u2014 /resume to start)"}: <b>${esc(p.name)}</b> \xB7 ${ruleSummary(e.settings)}${off}`;
      }
      case "/edges": {
        const x = this.o.edges?.();
        return edgesMessage(x?.report ?? null, x?.running ?? false);
      }
      case "/link": {
        const links = this.o.links?.() ?? [];
        if (!links.length) return "No dashboard link found on this computer's networks.";
        return links.map((l) => `${esc(l.label)}:
${esc(l.url)}`).join("\n\n");
      }
      case "/positions": {
        const open = e.account().open;
        if (!open.length) return "No open positions.";
        return open.map((p) => this.posLine(p)).join("\n");
      }
      case "/pause":
        e.updateSettings({ enabled: false });
        return "\u23F8 Auto-trading paused (open positions still managed).";
      case "/resume":
        e.updateSettings({ enabled: true });
        return `\u25B6\uFE0F Auto-trading on \xB7 score \u2265 ${e.settings.minScore}`;
      case "/score": {
        if (!Number.isFinite(n2)) return "Usage: /score 75";
        const off = byHand({ minScore: n2 });
        return `Minimum score set to ${e.settings.minScore}.${off}`;
      }
      case "/tp": {
        if (!Number.isFinite(n2)) return "Usage: /tp 100";
        const off = byHand({ tpPct: n2 });
        return `Take profit ${e.settings.tpPct}% (new positions).${off}`;
      }
      case "/sl": {
        if (!Number.isFinite(n2)) return "Usage: /sl 50";
        const off = byHand({ slPct: n2 });
        return `Stop loss ${e.settings.slPct}% (new positions).${off}`;
      }
      case "/hold": {
        if (!Number.isFinite(n2)) return "Usage: /hold 10 (minutes, 0 = no limit)";
        const off = byHand({ maxHoldMin: n2 });
        return `${e.settings.maxHoldMin > 0 ? `New positions sell after ${e.settings.maxHoldMin} min if neither TP nor SL was hit.` : "No time limit for new positions."}${off}`;
      }
      case "/size":
        if (!Number.isFinite(n2)) return "Usage: /size 0.1";
        e.updateSettings({ positionSol: n2 });
        return `Position size ${e.settings.positionSol} SOL.`;
      case "/scoreonly": {
        const on = arg === "on" || arg === "1" || arg === "true";
        const off = byHand({ scoreOnly: on });
        return `${on ? "Score only: ON \u2014 filters ignored, account limits still apply." : "Score only: OFF \u2014 filters active."}${off}`;
      }
      case "/kill":
        e.setKill(true, true);
        return "\u{1F6D1} Kill switch ON: no new entries, selling open positions.";
      case "/unkill":
        e.setKill(false);
        return "Kill switch off.";
      case "/update":
        return this.o.update?.() ?? "This bot cannot update itself.";
      default:
        return "Unknown command. /help";
    }
  }
  posLine(p) {
    const mult = p.cost > 0 ? (p.proceeds + p.value) / p.cost : 0;
    return `${mult >= 1 ? "\u{1F7E2}" : "\u{1F534}"} <b>$${esc(p.symbol || p.mint.slice(0, 4))}</b> ${((mult - 1) * 100).toFixed(0)}% \xB7 ${sol(p.cost)} SOL \xB7 TP ${p.plan.tpPct}% SL ${p.plan.slPct}%`;
  }
  onPosition(p, what) {
    if (!this.enabled) return;
    const link = `https://pump.fun/coin/${p.mint}`;
    const name = `<b>$${esc(p.symbol || p.mint.slice(0, 4))}</b>`;
    const tag = p.mode === "live" ? "LIVE" : "paper";
    if (what === "fill" && p.fills.length === 1) {
      this.send(`\u{1F7E2} BUY ${name} (${tag})
Score ${p.signalScore.toFixed(0)} \xB7 ${sol(p.cost)} SOL \xB7 mcap ${p.entryMcapSol.toFixed(0)} SOL
<a href="${link}">pump.fun</a>`);
    } else if (what === "close") {
      const icon = (p.pnl ?? 0) > 0 ? "\u2705" : "\u274C";
      this.send(`${icon} SELL ${name} (${tag}) \u2014 ${p.exitReason}
${(p.pnlPct ?? 0) >= 0 ? "+" : ""}${(p.pnlPct ?? 0).toFixed(1)}% \xB7 ${sol(p.pnl ?? 0)} SOL`);
    } else if (what === "fail") {
      this.send(`\u26A0\uFE0F Entry failed ${name}: ${esc(p.exitReason ?? "?")}`);
    }
  }
};
var signedPct3 = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
function edgesMessage(r, running, now = Date.now()) {
  if (!r) {
    return running ? "\u{1F50E} The edge finder is running for the first time \u2014 ask again in a few minutes." : "\u{1F50E} The edge finder has not run yet: it runs after the first learning round (20 min after start), then every 2 hours.";
  }
  const ago3 = Math.max(0, Math.round((now - r.generatedAt) / 6e4));
  const head = `\u{1F50E} <b>Edge finder</b> \xB7 checked ${ago3 < 120 ? `${ago3} min` : `${Math.round(ago3 / 60)} h`} ago${running ? " \xB7 running again now" : ""}`;
  if (r.status === "not_enough_data") return `${head}
Still collecting: ${esc(r.note)}`;
  const lines = [head, `${r.hours.toFixed(0)} h of market \xB7 ${r.samples.toLocaleString("en-US")} would-be trades \xB7 ${r.tested.toLocaleString("en-US")} rules tried`];
  if (r.survivors.length) {
    lines.push(`\u2705 <b>${r.survivors.length} rule${r.survivors.length > 1 ? "s" : ""} held up on data the search never saw:</b>`);
    r.survivors.slice(0, 3).forEach(
      (x, i) => lines.push(`${i + 1}. ${esc(x.text)}
    ${signedPct3(x.holdout.mean)} per trade on ${x.holdout.n} unseen trades \xB7 about ${x.tradesPerDay.toFixed(1)} a day`)
    );
    lines.push("Send /strategy to paper-trade one.");
  } else {
    lines.push("No rule has held up on unseen data yet. That is a real answer: it keeps the money out of rules that only looked good by luck.");
    const near = r.failed[0];
    if (near) lines.push(`Closest try: ${esc(near.text)} \u2014 ${signedPct3(near.discovery.mean)} while searching, ${signedPct3(near.holdout.mean)} on unseen data.`);
  }
  lines.push(`Luck check: on shuffled data the same search "finds" ${r.placebo.avgSurvivors.toFixed(1)} rules on average.`);
  return lines.join("\n");
}
var agoText = (t, now) => {
  const m = Math.max(0, Math.round((now - t) / 6e4));
  return m < 120 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
function learningMessage(v, now = Date.now()) {
  const recipeText = (r, trees) => r === "trees" ? `weighted sum + ${trees ?? 0} trees (learns combinations)` : r === "linear" ? "weighted sum, fitted to your data" : "starting assumptions";
  const lines = [
    `\u{1F9E0} <b>What the score learned</b>`,
    v.model.source === "trained" ? `Trained ${agoText(v.model.createdAt, now)} on this bot's own outcomes.` : "Still on the starting assumptions: it learns once enough outcomes have finished (the first try is 20 min after start).",
    `Bonding curve: ${recipeText(v.model.recipe.curve, v.model.trees.curve)} \xB7 Graduated: ${recipeText(v.model.recipe.amm, v.model.trees.amm)}`
  ];
  for (const f2 of v.fresh) {
    if (f2.verdict === "not_enough") continue;
    const where = f2.stage === "amm" ? "graduated" : "curve";
    const mark = f2.verdict === "working" ? "\u{1F7E2}" : f2.verdict === "slipping" ? "\u{1F7E0}" : "\u{1F534}";
    lines.push(`${mark} On ${f2.n.toLocaleString("en-US")} ${where} coins it had not seen, it ranked winners above losers ${(f2.auc * 100).toFixed(0)}% of the time (50% = a coin toss).`);
  }
  if (v.fresh.every((f2) => f2.verdict === "not_enough")) lines.push("\u23F3 Not enough finished outcomes of coins it has not seen yet to check it.");
  const d = v.drivers.curve ?? v.drivers.amm;
  if (d?.length) {
    const arrow = (x) => x === "up" ? "\u2191" : x === "down" ? "\u2193" : "\u2195";
    lines.push(`Moves the score most: ${d.slice(0, 5).map((x) => `${arrow(x.dir)} ${esc(x.label)}`).join(" \xB7 ")}`);
  }
  const last = v.history[v.history.length - 1];
  if (last) lines.push(`Last learning run ${agoText(last.at, now)}: ${last.adopted ? "switched to a better score" : esc(last.stages.map((s) => s.reason).find(Boolean) ?? "kept the current score")}.`);
  if (v.status.running) lines.push("Learning right now\u2026");
  else if (v.status.nextRun > now) lines.push(`Next run in ${Math.max(1, Math.round((v.status.nextRun - now) / 6e4))} min.`);
  return lines.join("\n");
}
function autopilotLine(v, on) {
  if (!on) return "\u{1F916} Autopilot off (/autopilot on)";
  if (!v) return "\u{1F916} Autopilot on";
  if (v.holding) return `\u{1F916} Autopilot: holding new live entries \u2014 ${esc(v.holdReason)}`;
  return v.active ? "\u{1F916} Autopilot: trading the best proven rule" : "\u{1F916} Autopilot: on your own rule until a proven one does clearly better";
}
function autopilotMessage(v, on, now = Date.now()) {
  if (!on) return "\u{1F916} Autopilot is off. Send /autopilot on to let the bot trade the best proven rule by itself.";
  if (!v) return "\u{1F916} Autopilot is on.";
  const lines = ["\u{1F916} <b>Autopilot is on</b>"];
  if (v.holding) lines.push(`\u23F8 New live entries wait: ${esc(v.holdReason)}. Open positions are still managed.`);
  else if (v.active && v.proof)
    lines.push(
      `Trading since ${agoText(v.since, now)}: ${esc(v.active)}`,
      `It showed ${signedPct3(v.proof.mean)} per trade on ${v.proof.n} trades the search never saw (worst case ${signedPct3(v.proof.lo)}).`
    );
  else {
    lines.push(`On your own rule (${esc(v.rule)}): a proven rule replaces it only when it does clearly better.`);
    const own = v.own;
    if (own && "from" in own)
      lines.push(
        own.from === "trades" ? `Weighed by its own ${own.n} trades: ${signedPct3(own.mean)} each (at least ${signedPct3(own.lo)}), ~${own.worstSolPerDay.toFixed(2)} SOL/day at its worst.` : `Weighed on the newest recordings: ${signedPct3(own.mean)} per trade on ${own.n} coins (at least ${signedPct3(own.lo)}), ~${own.worstSolPerDay.toFixed(2)} SOL/day at its worst.`
      );
    else if (own && "why" in own) lines.push(`Nothing to weigh it by yet: ${esc(own.why)}.`);
  }
  const top = v.ranking.filter((r) => !r.active).slice(0, 2);
  if (top.length) lines.push("Next best:", ...top.map((r) => `\u2022 ${esc(r.text)} \u2014 worst case ~${r.worstSolPerDay.toFixed(2)} SOL/day at your limits`));
  const last = v.log[0];
  if (last) lines.push(`Last decision ${agoText(last.at, now)}: ${esc(last.what)}`);
  return lines.join("\n");
}

// src/node/update.ts
import { existsSync as existsSync6, mkdirSync as mkdirSync2, readFileSync as readFileSync7, renameSync as renameSync2, rmSync as rmSync3, writeFileSync as writeFileSync3, chmodSync as chmodSync2 } from "node:fs";
import { dirname, join as join5 } from "node:path";
import { inflateRawSync } from "node:zlib";
var REPO = "kuzesociety/kuzesociety";
var BRANCH = "claude/signal-meme-trading-bot-o142hw";
var UPDATE_ZIP_URL = `https://github.com/${REPO}/archive/refs/heads/${BRANCH}.zip`;
var UPDATE_VERSION_URL = `https://raw.githubusercontent.com/${REPO}/refs/heads/${BRANCH}/signal/dist/version.json`;
var KEEP = ["data", "node_modules", ".env"];
var REQUIRED = ["dist/engine.mjs", "dist/version.json", "package.json", "start-windows.bat"];
var MAX_ZIP_BYTES = 60 * 1024 * 1024;
var CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 4294967295;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 101010256) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("the download is not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count === 65535 || p === 4294967295) throw new Error("zip64 archives are not supported");
  const out = [];
  for (let n2 = 0; n2 < count; n2++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 33639248) throw new Error("the download is damaged (zip directory)");
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const next = p + 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const mode = buf.readUInt32LE(p + 38) >>> 16 & 511;
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p = next;
    if (name.endsWith("/")) continue;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 67324752) throw new Error(`the download is damaged (${name})`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start + csize > buf.length) throw new Error(`the download is cut short (${name})`);
    const raw = buf.subarray(start, start + csize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`unsupported compression in ${name}`);
    if (data.length !== size || crc32(data) !== crc) throw new Error(`the download is damaged (${name})`);
    out.push({ name, data, mode });
  }
  return out;
}
function safeRelative(rel) {
  return rel.length > 0 && !rel.includes("\\") && !rel.includes(":") && rel.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}
function botFiles(entries) {
  const main2 = entries.find((e) => /^[^/]+\/signal\/dist\/engine\.mjs$/.test(e.name));
  if (!main2) throw new Error("the download does not contain the bot");
  const prefix = main2.name.slice(0, -"dist/engine.mjs".length);
  const files = /* @__PURE__ */ new Map();
  for (const e of entries) {
    if (!e.name.startsWith(prefix)) continue;
    const rel = e.name.slice(prefix.length);
    if (!safeRelative(rel) || KEEP.some((k) => rel === k || rel.startsWith(`${k}/`))) continue;
    files.set(rel, e);
  }
  for (const need of REQUIRED) if (!files.has(need)) throw new Error(`the download is missing ${need}`);
  return files;
}
function versionOf(json) {
  try {
    const v = JSON.parse(String(json)).version;
    return typeof v === "string" && /^[0-9a-f]{6,64}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}
function readVersion(installDir) {
  try {
    return versionOf(readFileSync7(join5(installDir, "dist", "version.json")));
  } catch {
    return null;
  }
}
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var LAST = ["dist/engine.mjs", "dist/version.json"];
async function installFiles(dir, files) {
  const rank = (rel) => LAST.indexOf(rel) + 1;
  const order = [...files.keys()].sort((a, b) => rank(a) - rank(b));
  let changed = 0;
  for (const rel of order) {
    const e = files.get(rel);
    const target = join5(dir, ...rel.split("/"));
    try {
      if (readFileSync7(target).equals(e.data)) continue;
    } catch {
    }
    mkdirSync2(dirname(target), { recursive: true });
    const tmp = `${target}.updating`;
    writeFileSync3(tmp, e.data);
    if (process.platform !== "win32" && e.mode & 73) chmodSync2(tmp, 493);
    for (let attempt = 1; ; attempt++) {
      try {
        renameSync2(tmp, target);
        break;
      } catch (err2) {
        if (attempt >= 8) {
          rmSync3(tmp, { force: true });
          throw new Error(`could not replace ${rel}: ${err2.message}`);
        }
        await sleep(250 * attempt);
      }
    }
    changed++;
  }
  return changed;
}
function findInstallDir(from) {
  let d = from;
  for (let i = 0; i < 4; i++) {
    if (existsSync6(join5(d, "package.json"))) return d;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}
var Updater = class {
  constructor(o) {
    this.o = o;
    this.current = o.installDir ? readVersion(o.installDir) : null;
    this.why = !o.selfUpdate ? "This bot was not started with start-windows.bat or start-mac.command, so it cannot update itself: download the new version, or redeploy it on a server." : !o.installDir || !existsSync6(join5(o.installDir, "dist", "engine.mjs")) ? "The bot's folder was not found." : existsSync6(join5(o.installDir, ".git")) || existsSync6(join5(o.installDir, "..", ".git")) ? "This copy is a git checkout: update it with git pull, then npm run build." : null;
  }
  latest = null;
  checkedAt = 0;
  state = "idle";
  error = null;
  busy = false;
  timers = [];
  current;
  why;
  get can() {
    return this.why === null;
  }
  status() {
    return {
      current: this.current,
      latest: this.latest,
      checkedAt: this.checkedAt,
      available: this.available,
      can: this.can,
      why: this.why,
      state: this.state,
      error: this.error
    };
  }
  get available() {
    return !!this.latest && this.latest !== this.current;
  }
  /** Checks now, then every few hours. Only a copy that can update itself looks. */
  start() {
    if (!this.can) return;
    const first = setTimeout(() => void this.check(), this.o.firstCheckMs ?? 2e4);
    const every = setInterval(() => void this.check(), this.o.checkEveryMs ?? 6 * 36e5);
    first.unref?.();
    every.unref?.();
    this.timers.push(first, every);
  }
  stop() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
  async check() {
    if (this.busy) return this.status();
    try {
      const res = await fetch(this.o.versionUrl ?? UPDATE_VERSION_URL, { signal: AbortSignal.timeout(15e3), headers: { "cache-control": "no-cache" } });
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
      const v = versionOf(await res.text());
      if (!v) throw new Error("GitHub sent no version");
      this.latest = v;
      this.checkedAt = Date.now();
      if (this.available) this.announce(v);
    } catch (e) {
      this.o.log.warn("update check failed", { err: String(e.message ?? e) });
    }
    return this.status();
  }
  announce(v) {
    if (!this.o.onAvailable) return;
    try {
      if (this.o.notedFile && existsSync6(this.o.notedFile) && readFileSync7(this.o.notedFile, "utf8").trim() === v) return;
      if (this.o.notedFile) writeFileSync3(this.o.notedFile, v);
    } catch {
    }
    this.o.onAvailable(v);
  }
  /** Downloads, checks and installs the newest version, then restarts the bot. */
  async apply() {
    if (!this.can) return { ok: false, error: this.why };
    if (this.busy) return { ok: false, error: "An update is already running." };
    this.busy = true;
    this.error = null;
    try {
      this.state = "downloading";
      this.o.log.info("update: downloading the newest version");
      const res = await fetch(this.o.zipUrl ?? UPDATE_ZIP_URL, { signal: AbortSignal.timeout(18e4), redirect: "follow" });
      if (!res.ok) throw new Error(`the download failed (GitHub answered ${res.status})`);
      if (Number(res.headers.get("content-length") ?? 0) > MAX_ZIP_BYTES) throw new Error("the download is unexpectedly large");
      const zip = Buffer.from(await res.arrayBuffer());
      if (zip.length > MAX_ZIP_BYTES) throw new Error("the download is unexpectedly large");
      this.state = "installing";
      const files = botFiles(unzip(zip));
      const version = versionOf(files.get("dist/version.json").data);
      if (!version) throw new Error("the download has no version");
      this.latest = version;
      this.checkedAt = Date.now();
      if (version === this.current) {
        this.state = "idle";
        return { ok: true, upToDate: true, version, files: 0, restarting: false };
      }
      const changed = await installFiles(this.o.installDir, files);
      this.o.log.info("update installed \u2014 restarting", { from: this.current, to: version, files: changed });
      const restarting = this.o.restart();
      this.state = restarting ? "restarting" : "idle";
      return { ok: true, upToDate: false, version, files: changed, restarting };
    } catch (e) {
      const msg = String(e.message ?? e);
      this.state = "failed";
      this.error = msg;
      this.o.log.error("update failed", { err: msg });
      return { ok: false, error: `Update failed: ${msg}. The bot keeps running the version it has \u2014 try again later.` };
    } finally {
      this.busy = false;
    }
  }
};

// src/node/main.ts
function dashboardHtml() {
  if ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="theme-color" content="#0f1318">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<meta name="apple-mobile-web-app-title" content="SIGNAL">\n<title>SIGNAL</title>\n<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' rx=\'7\' fill=\'%230f1318\'/%3E%3Cpath d=\'M6 22 L12 14 L17 18 L26 8\' stroke=\'%23f2a93b\' stroke-width=\'3.2\' fill=\'none\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E">\n<style>\n:root{\n  --ground:#f5f6f8; --surface:#ffffff; --raised:#eef1f5; --line:#dde2ea; --line2:#c9d0db;\n  --ink:#10151c; --ink2:#4a5566; --ink3:#7a8596;\n  --flare:#b86e00; --flare-soft:#fbead0; --flare-ink:#1a1204;\n  --good:#138a5a; --good-soft:#dff3ea; --bad:#cc3340; --bad-soft:#fbe3e5; --warn:#9a7400; --warn-soft:#f7efcf; --info:#2f6fc0;\n  --shadow:0 1px 2px rgba(16,21,28,.06),0 6px 20px rgba(16,21,28,.06);\n  --r:12px; --r-sm:8px;\n  --mono:ui-monospace,"SF Mono","Cascadia Mono","JetBrains Mono",Menlo,Consolas,monospace;\n  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI Variable","Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,sans-serif;\n  color-scheme:light;\n}\n@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){\n  --ground:#0f1318; --surface:#161b22; --raised:#1d2430; --line:#262e3b; --line2:#334052;\n  --ink:#e7ebf2; --ink2:#a3adbd; --ink3:#6f7a8c;\n  --flare:#f2a93b; --flare-soft:#3a2a12; --flare-ink:#1a1204;\n  --good:#3ecf8e; --good-soft:#12301f; --bad:#ff6b6b; --bad-soft:#3a1519; --warn:#e8c547; --warn-soft:#332b0f; --info:#6aa8ff;\n  --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.25);\n  color-scheme:dark;\n}}\n:root[data-theme="dark"]{\n  --ground:#0f1318; --surface:#161b22; --raised:#1d2430; --line:#262e3b; --line2:#334052;\n  --ink:#e7ebf2; --ink2:#a3adbd; --ink3:#6f7a8c;\n  --flare:#f2a93b; --flare-soft:#3a2a12; --flare-ink:#1a1204;\n  --good:#3ecf8e; --good-soft:#12301f; --bad:#ff6b6b; --bad-soft:#3a1519; --warn:#e8c547; --warn-soft:#332b0f; --info:#6aa8ff;\n  --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.25);\n  color-scheme:dark;\n}\n*{box-sizing:border-box}\nhtml,body{margin:0;height:100%}\nbody{background:var(--ground);color:var(--ink);font:14px/1.45 var(--sans);-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}\nbutton,input,select{font:inherit;color:inherit}\na{color:var(--info);text-decoration:none}\n[hidden]{display:none!important}\n.num{font-variant-numeric:tabular-nums}\n.mono{font-family:var(--mono);font-size:12.5px}\n.muted{color:var(--ink2)} .faint{color:var(--ink3)}\n.good{color:var(--good)} .bad{color:var(--bad)} .warn{color:var(--warn)} .flare{color:var(--flare)}\n\n/* shell */\n.app{min-height:100%;display:flex;flex-direction:column}\n.top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--ground) 88%,transparent);backdrop-filter:saturate(1.4) blur(12px);-webkit-backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--line);padding:calc(env(safe-area-inset-top,0px) + 10px) 16px 10px}\n.top-row{display:flex;align-items:center;gap:10px;max-width:1180px;margin:0 auto}\n.brand{display:flex;align-items:center;gap:8px;font-weight:750;letter-spacing:.14em;font-size:13px}\n.brand svg{flex:none}\n.pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:650;border:1px solid var(--line);background:var(--surface);white-space:nowrap}\n.dot{width:8px;height:8px;border-radius:50%;background:var(--ink3);flex:none}\n.dot.on{background:var(--good);box-shadow:0 0 0 3px color-mix(in srgb,var(--good) 22%,transparent)}\n.dot.off{background:var(--bad)} .dot.mid{background:var(--warn)}\n.spacer{flex:1}\n.top-pnl{font-weight:700;font-size:15px;white-space:nowrap}\n.main{flex:1;width:100%;max-width:1180px;margin:0 auto;padding:14px 16px calc(84px + env(safe-area-inset-bottom,0px))}\n.tabs{position:fixed;left:0;right:0;bottom:0;z-index:30;display:flex;justify-content:space-around;background:color-mix(in srgb,var(--surface) 94%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);padding:6px 6px calc(6px + env(safe-area-inset-bottom,0px))}\n.tab{flex:1;max-width:120px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px;border:0;background:none;border-radius:10px;color:var(--ink3);font-size:11px;font-weight:600;cursor:pointer}\n.tab svg{width:22px;height:22px}\n.tab[aria-current="page"]{color:var(--flare)}\n.tab:focus-visible,.btn:focus-visible,.chip:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--flare);outline-offset:2px}\n@media (min-width:900px){\n  .tabs{position:sticky;top:57px;bottom:auto;justify-content:flex-start;gap:4px;padding:6px 16px;border-top:0;border-bottom:1px solid var(--line);background:var(--ground)}\n  .tab{flex:none;flex-direction:row;gap:8px;font-size:13px;padding:8px 14px;max-width:none}\n  .tab svg{width:18px;height:18px}\n  .tab[aria-current="page"]{background:var(--flare-soft)}\n  .main{padding-bottom:40px}\n}\n.banner{max-width:1180px;width:calc(100% - 32px);margin:10px auto 0;padding:10px 14px;border-radius:var(--r-sm);font-weight:600;font-size:13px;display:flex;gap:10px;align-items:center}\n.banner.sim{background:var(--warn-soft);color:var(--warn);border:1px solid color-mix(in srgb,var(--warn) 30%,transparent)}\n.banner.bad{background:var(--bad-soft);color:var(--bad);border:1px solid color-mix(in srgb,var(--bad) 30%,transparent)}\n.savebar{position:fixed;z-index:40;left:50%;transform:translateX(-50%);bottom:calc(76px + env(safe-area-inset-bottom,0px));width:min(640px,calc(100% - 24px));display:flex;gap:8px;align-items:center;padding:10px 12px;border-radius:var(--r);background:var(--surface);color:var(--ink);border:1px solid color-mix(in srgb,var(--flare) 55%,var(--line));box-shadow:var(--shadow);font-size:13px;font-weight:600}\n@media (min-width:900px){.savebar{bottom:20px}}\n.main:has(.savebar){padding-bottom:calc(150px + env(safe-area-inset-bottom,0px))}\n.banner.info{background:color-mix(in srgb,var(--info) 12%,var(--surface));color:var(--info);border:1px solid color-mix(in srgb,var(--info) 30%,transparent)}\n\n/* building blocks */\n.grid{display:grid;gap:12px}\n.grid > *{min-width:0}\n.main{overflow-x:clip}\n@media (min-width:760px){.grid.two{grid-template-columns:1fr 1fr}.grid.three{grid-template-columns:repeat(3,1fr)}}\n.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:14px;box-shadow:var(--shadow)}\n.card.flat{box-shadow:none}\n.card h2,.card h3{margin:0 0 10px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2);font-weight:700}\n.section-title{display:flex;align-items:baseline;gap:10px;margin:18px 2px 10px}\n.section-title h2{margin:0;font-size:17px;font-weight:720;text-wrap:balance}\n.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}\n@media (min-width:640px){.stats{grid-template-columns:repeat(4,1fr)}}\n.stat .k{font-size:11.5px;color:var(--ink3);text-transform:uppercase;letter-spacing:.06em;font-weight:650}\n.stat .v{font-size:20px;font-weight:720;margin-top:2px}\n.stat .s{font-size:12px;color:var(--ink2)}\n.row{display:flex;align-items:center;gap:10px}\n.wrap{flex-wrap:wrap}\n.chips{display:flex;gap:6px;flex-wrap:wrap}\n.chip{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:5px 11px;font-size:12.5px;font-weight:600;cursor:pointer;color:var(--ink2)}\n.chip[aria-pressed="true"]{background:var(--ink);color:var(--ground);border-color:var(--ink)}\n.tag{display:inline-block;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:650;background:var(--raised);color:var(--ink2);white-space:nowrap}\n.tag.good{background:var(--good-soft);color:var(--good)} .tag.bad{background:var(--bad-soft);color:var(--bad)} .tag.warn{background:var(--warn-soft);color:var(--warn)} .tag.flare{background:var(--flare-soft);color:var(--flare)}\n.btn{border:1px solid var(--line2);background:var(--surface);border-radius:10px;padding:9px 14px;font-weight:650;cursor:pointer;min-height:40px}\n.btn.primary{background:var(--flare);border-color:var(--flare);color:var(--flare-ink)}\n.btn.danger{background:var(--bad);border-color:var(--bad);color:#fff}\n.btn.ghost{background:none;border-color:transparent}\n.btn.sm{min-height:32px;padding:5px 10px;font-size:12.5px}\n.btn:disabled{opacity:.5;cursor:not-allowed}\n\n/* score badge */\n.score{flex:none;width:46px;height:46px;border-radius:12px;display:grid;place-items:center;font-weight:800;font-size:17px;background:var(--raised);color:var(--ink2);position:relative}\n.score small{position:absolute;bottom:3px;font-size:8.5px;font-weight:700;letter-spacing:.06em;opacity:.8}\n.score.b1{background:var(--raised);color:var(--ink3)}\n.score.b2{background:color-mix(in srgb,var(--flare) 16%,var(--surface));color:var(--ink)}\n.score.b3{background:var(--flare);color:var(--flare-ink)}\n\n/* radar list */\n.list{display:flex;flex-direction:column;gap:8px}\n.coin{display:flex;gap:12px;align-items:flex-start;padding:12px;border-radius:var(--r);background:var(--surface);border:1px solid var(--line);cursor:pointer;text-align:left;width:100%}\n.coin:hover{border-color:var(--line2)}\n.coin.held{border-color:var(--flare);box-shadow:inset 3px 0 0 var(--flare)}\n.coin .body{flex:1;min-width:0}\n.coin .title{display:flex;align-items:baseline;gap:6px;min-width:0}\n.coin .sym{font-weight:760;font-size:15px}\n.coin .name{color:var(--ink3);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.coin .meta{display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;font-size:12.5px;color:var(--ink2)}\n.coin .why{margin-top:6px;font-size:12px;color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.coin .right{text-align:right;flex:none}\n.bar{height:5px;border-radius:3px;background:var(--raised);overflow:hidden;margin-top:6px}\n.bar > i{display:block;height:100%;background:var(--flare);border-radius:3px}\n.img{width:34px;height:34px;border-radius:9px;object-fit:cover;background:var(--raised);flex:none}\n\n/* forms */\n.field{display:flex;flex-direction:column;gap:6px;padding:12px 0;border-bottom:1px solid var(--line)}\n.field:last-child{border-bottom:0}\n.field label{font-weight:650}\n.field .help{font-size:12.5px;color:var(--ink3)}\n.field .ctrl{display:flex;align-items:center;gap:10px}\n.inp{width:100%;max-width:140px;padding:9px 11px;border-radius:10px;border:1px solid var(--line2);background:var(--ground);font-variant-numeric:tabular-nums}\ninput[type=range]{flex:1;accent-color:var(--flare);height:32px}\n.switch{position:relative;width:48px;height:28px;flex:none}\n.switch input{opacity:0;width:0;height:0;position:absolute}\n.switch span{position:absolute;inset:0;border-radius:999px;background:var(--line2);transition:.15s}\n.switch span::after{content:"";position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:.15s}\n.switch input:checked + span{background:var(--flare)}\n.switch input:checked + span::after{transform:translateX(20px)}\n.switch input:focus-visible + span{outline:2px solid var(--flare);outline-offset:2px}\n.bigswitch{display:flex;align-items:center;gap:14px;padding:14px;border-radius:var(--r);border:1px solid var(--line);background:var(--surface)}\n.bigswitch.on{border-color:var(--good);background:color-mix(in srgb,var(--good) 7%,var(--surface))}\ndetails.more{border-top:1px solid var(--line);margin-top:6px}\ndetails.more summary{cursor:pointer;padding:12px 0;font-weight:650;color:var(--ink2)}\n\n/* tables */\n.tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch}\ntable{width:100%;border-collapse:collapse;font-size:13px}\nth{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3);font-weight:700;padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap}\ntd{padding:7px 8px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums;white-space:nowrap}\ntd.r,th.r{text-align:right}\ntr:last-child td{border-bottom:0}\n\n/* contribution bars */\n.contrib{display:grid;grid-template-columns:1fr 90px;gap:4px 10px;align-items:center;font-size:12.5px}\n.cbar{position:relative;height:8px;background:var(--raised);border-radius:4px}\n.cbar i{position:absolute;top:0;bottom:0;border-radius:4px}\n.cbar .mid{position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--line2)}\n\n/* sheet */\n.sheet-bg{position:fixed;inset:0;z-index:50;background:rgba(8,10,14,.5);display:flex;align-items:flex-end;justify-content:center}\n.sheet{width:100%;max-width:760px;max-height:92vh;overflow:auto;background:var(--ground);border-radius:18px 18px 0 0;padding:16px 16px calc(24px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px rgba(0,0,0,.35)}\n@media (min-width:760px){.sheet-bg{align-items:center}.sheet{border-radius:18px;max-height:86vh}}\n.grab{width:40px;height:5px;border-radius:3px;background:var(--line2);margin:0 auto 12px}\n.entrymoment{padding:10px 12px;border-radius:var(--r-sm);background:var(--raised);color:var(--ink2);font-size:13px}\n.entrymoment.good{background:var(--good-soft);color:var(--good)}\n.entrymoment.warn{background:var(--warn-soft);color:var(--warn)}\n\n.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(90px + env(safe-area-inset-bottom,0px));z-index:60;background:var(--ink);color:var(--ground);padding:10px 16px;border-radius:12px;font-weight:650;box-shadow:var(--shadow);max-width:calc(100% - 32px)}\n.empty{padding:28px 16px;text-align:center;color:var(--ink3)}\n.login{max-width:420px;margin:12vh auto;padding:0 16px}\n.hist{display:flex;align-items:flex-end;gap:3px;height:56px}\n.hist i{flex:1;background:var(--line2);border-radius:3px 3px 0 0;min-height:2px}\n.hist i.hot{background:var(--flare)}\n.spark{width:100%;height:64px;display:block}\n.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:13px}\n.kv dt{color:var(--ink3)} .kv dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis}\n.heat td{text-align:center;font-weight:650}\n.note{font-size:12.5px;margin:10px 0 0}\n.edge-meta{font-size:13px;color:var(--ink2);margin:10px 0 4px}\n.edge{display:grid;gap:3px;padding:10px 0;border-top:1px solid var(--line)}\n.edge-rule{font-weight:700}\n.strat{display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}\n.strat.active{box-shadow:inset 3px 0 0 var(--flare);padding-left:10px}\n.inp.wide{max-width:none;flex:1;min-width:0}\n.step .stepno{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--raised);font-weight:750;font-size:13px;flex:none}\n.step.done{border-color:color-mix(in srgb,var(--good) 35%,var(--line))}\n.step.done .stepno{background:var(--good-soft);color:var(--good)}\n.step.hot{border-color:color-mix(in srgb,var(--info) 45%,var(--line))}\n.step.hot .stepno{background:color-mix(in srgb,var(--info) 15%,var(--surface));color:var(--info)}\n.steps{margin:0;padding-left:20px;display:grid;gap:6px}\n.copyline{display:flex;gap:8px;align-items:center}\n.copyline code{flex:1;min-width:0;overflow-wrap:anywhere;font-family:var(--mono);font-size:12px;background:var(--raised);padding:6px 8px;border-radius:6px}\n.linkcode{font-size:20px;letter-spacing:.12em;color:var(--flare)}\n.learn-head{font-size:14px;color:var(--ink);text-wrap:pretty}\n.card h3.learn-sub{margin:14px 0 4px;font-size:12px}\n.fresh{display:grid;gap:4px;padding:10px 0;border-top:1px solid var(--line)}\n.drivers{display:grid;gap:9px;margin-top:8px}\n.driver{display:grid;grid-template-columns:16px 1fr auto;gap:2px 8px;align-items:center;font-size:13px}\n.driver .arrow{font-weight:800;text-align:center}\n.driver .bar,.driver .was{grid-column:2 / 4}\n.driver .bar{margin-top:2px}\n.driver .was{font-size:11.5px}\n@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}\n</style>\n</head>\n<body>\n<div id="root"></div>\n<script>"use strict";(()=>{var Oe,F,St,zn,le,yt,_t,kt,Mt,Ze,Qe,Xe,Un,ve={},Tt=[],qn=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,Ne=Array.isArray;function oe(e,n){for(var o in n)e[o]=n[o];return e}function et(e){e&&e.parentNode&&e.parentNode.removeChild(e)}function Wn(e,n,o){var r,a,s,i={};for(s in n)s=="key"?r=n[s]:s=="ref"?a=n[s]:i[s]=n[s];if(arguments.length>2&&(i.children=arguments.length>3?Oe.call(arguments,2):o),typeof e=="function"&&e.defaultProps!=null)for(s in e.defaultProps)i[s]===void 0&&(i[s]=e.defaultProps[s]);return Ee(e,i,r,a,null)}function Ee(e,n,o,r,a){var s={type:e,props:n,key:o,ref:r,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:a??++St,__i:-1,__u:0};return a==null&&F.vnode!=null&&F.vnode(s),s}function M(e){return e.children}function Re(e,n){this.props=e,this.context=n}function he(e,n){if(n==null)return e.__?he(e.__,e.__i+1):null;for(var o;n<e.__k.length;n++)if((o=e.__k[n])!=null&&o.__e!=null)return o.__e;return typeof e.type=="function"?he(e):null}function $t(e){var n,o;if((e=e.__)!=null&&e.__c!=null){for(e.__e=e.__c.base=null,n=0;n<e.__k.length;n++)if((o=e.__k[n])!=null&&o.__e!=null){e.__e=e.__c.base=o.__e;break}return $t(e)}}function vt(e){(!e.__d&&(e.__d=!0)&&le.push(e)&&!Ce.__r++||yt!=F.debounceRendering)&&((yt=F.debounceRendering)||_t)(Ce)}function Ce(){for(var e,n,o,r,a,s,i,l=1;le.length;)le.length>l&&le.sort(kt),e=le.shift(),l=le.length,e.__d&&(o=void 0,r=void 0,a=(r=(n=e).__v).__e,s=[],i=[],n.__P&&((o=oe({},r)).__v=r.__v+1,F.vnode&&F.vnode(o),tt(n.__P,o,r,n.__n,n.__P.namespaceURI,32&r.__u?[a]:null,s,a??he(r),!!(32&r.__u),i),o.__v=r.__v,o.__.__k[o.__i]=o,At(s,o,i),r.__e=r.__=null,o.__e!=a&&$t(o)));Ce.__r=0}function Pt(e,n,o,r,a,s,i,l,d,p,c){var u,g,f,m,_,v,w,T=r&&r.__k||Tt,U=n.length;for(d=jn(o,n,T,d,U),u=0;u<U;u++)(f=o.__k[u])!=null&&(g=f.__i==-1?ve:T[f.__i]||ve,f.__i=u,v=tt(e,f,g,a,s,i,l,d,p,c),m=f.__e,f.ref&&g.ref!=f.ref&&(g.ref&&nt(g.ref,null,f),c.push(f.ref,f.__c||m,f)),_==null&&m!=null&&(_=m),(w=!!(4&f.__u))||g.__k===f.__k?d=Lt(f,d,e,w):typeof f.type=="function"&&v!==void 0?d=v:m&&(d=m.nextSibling),f.__u&=-7);return o.__e=_,d}function jn(e,n,o,r,a){var s,i,l,d,p,c=o.length,u=c,g=0;for(e.__k=new Array(a),s=0;s<a;s++)(i=n[s])!=null&&typeof i!="boolean"&&typeof i!="function"?(d=s+g,(i=e.__k[s]=typeof i=="string"||typeof i=="number"||typeof i=="bigint"||i.constructor==String?Ee(null,i,null,null,null):Ne(i)?Ee(M,{children:i},null,null,null):i.constructor==null&&i.__b>0?Ee(i.type,i.props,i.key,i.ref?i.ref:null,i.__v):i).__=e,i.__b=e.__b+1,l=null,(p=i.__i=Vn(i,o,d,u))!=-1&&(u--,(l=o[p])&&(l.__u|=2)),l==null||l.__v==null?(p==-1&&(a>c?g--:a<c&&g++),typeof i.type!="function"&&(i.__u|=4)):p!=d&&(p==d-1?g--:p==d+1?g++:(p>d?g--:g++,i.__u|=4))):e.__k[s]=null;if(u)for(s=0;s<c;s++)(l=o[s])!=null&&(2&l.__u)==0&&(l.__e==r&&(r=he(l)),Et(l,l));return r}function Lt(e,n,o,r){var a,s;if(typeof e.type=="function"){for(a=e.__k,s=0;a&&s<a.length;s++)a[s]&&(a[s].__=e,n=Lt(a[s],n,o,r));return n}e.__e!=n&&(r&&(n&&e.type&&!n.parentNode&&(n=he(e)),o.insertBefore(e.__e,n||null)),n=e.__e);do n=n&&n.nextSibling;while(n!=null&&n.nodeType==8);return n}function Vn(e,n,o,r){var a,s,i,l=e.key,d=e.type,p=n[o],c=p!=null&&(2&p.__u)==0;if(p===null&&e.key==null||c&&l==p.key&&d==p.type)return o;if(r>(c?1:0)){for(a=o-1,s=o+1;a>=0||s<n.length;)if((p=n[i=a>=0?a--:s++])!=null&&(2&p.__u)==0&&l==p.key&&d==p.type)return i}return-1}function wt(e,n,o){n[0]=="-"?e.setProperty(n,o??""):e[n]=o==null?"":typeof o!="number"||qn.test(n)?o:o+"px"}function Fe(e,n,o,r,a){var s,i;e:if(n=="style")if(typeof o=="string")e.style.cssText=o;else{if(typeof r=="string"&&(e.style.cssText=r=""),r)for(n in r)o&&n in o||wt(e.style,n,"");if(o)for(n in o)r&&o[n]==r[n]||wt(e.style,n,o[n])}else if(n[0]=="o"&&n[1]=="n")s=n!=(n=n.replace(Mt,"$1")),i=n.toLowerCase(),n=i in e||n=="onFocusOut"||n=="onFocusIn"?i.slice(2):n.slice(2),e.l||(e.l={}),e.l[n+s]=o,o?r?o.u=r.u:(o.u=Ze,e.addEventListener(n,s?Xe:Qe,s)):e.removeEventListener(n,s?Xe:Qe,s);else{if(a=="http://www.w3.org/2000/svg")n=n.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(n!="width"&&n!="height"&&n!="href"&&n!="list"&&n!="form"&&n!="tabIndex"&&n!="download"&&n!="rowSpan"&&n!="colSpan"&&n!="role"&&n!="popover"&&n in e)try{e[n]=o??"";break e}catch{}typeof o=="function"||(o==null||o===!1&&n[4]!="-"?e.removeAttribute(n):e.setAttribute(n,n=="popover"&&o==1?"":o))}}function xt(e){return function(n){if(this.l){var o=this.l[n.type+e];if(n.t==null)n.t=Ze++;else if(n.t<o.u)return;return o(F.event?F.event(n):n)}}}function tt(e,n,o,r,a,s,i,l,d,p){var c,u,g,f,m,_,v,w,T,U,W,G,z,C,h,H,Y,I=n.type;if(n.constructor!=null)return null;128&o.__u&&(d=!!(32&o.__u),s=[l=n.__e=o.__e]),(c=F.__b)&&c(n);e:if(typeof I=="function")try{if(w=n.props,T="prototype"in I&&I.prototype.render,U=(c=I.contextType)&&r[c.__c],W=c?U?U.props.value:c.__:r,o.__c?v=(u=n.__c=o.__c).__=u.__E:(T?n.__c=u=new I(w,W):(n.__c=u=new Re(w,W),u.constructor=I,u.render=Gn),U&&U.sub(u),u.props=w,u.state||(u.state={}),u.context=W,u.__n=r,g=u.__d=!0,u.__h=[],u._sb=[]),T&&u.__s==null&&(u.__s=u.state),T&&I.getDerivedStateFromProps!=null&&(u.__s==u.state&&(u.__s=oe({},u.__s)),oe(u.__s,I.getDerivedStateFromProps(w,u.__s))),f=u.props,m=u.state,u.__v=n,g)T&&I.getDerivedStateFromProps==null&&u.componentWillMount!=null&&u.componentWillMount(),T&&u.componentDidMount!=null&&u.__h.push(u.componentDidMount);else{if(T&&I.getDerivedStateFromProps==null&&w!==f&&u.componentWillReceiveProps!=null&&u.componentWillReceiveProps(w,W),!u.__e&&u.shouldComponentUpdate!=null&&u.shouldComponentUpdate(w,u.__s,W)===!1||n.__v==o.__v){for(n.__v!=o.__v&&(u.props=w,u.state=u.__s,u.__d=!1),n.__e=o.__e,n.__k=o.__k,n.__k.some(function($){$&&($.__=n)}),G=0;G<u._sb.length;G++)u.__h.push(u._sb[G]);u._sb=[],u.__h.length&&i.push(u);break e}u.componentWillUpdate!=null&&u.componentWillUpdate(w,u.__s,W),T&&u.componentDidUpdate!=null&&u.__h.push(function(){u.componentDidUpdate(f,m,_)})}if(u.context=W,u.props=w,u.__P=e,u.__e=!1,z=F.__r,C=0,T){for(u.state=u.__s,u.__d=!1,z&&z(n),c=u.render(u.props,u.state,u.context),h=0;h<u._sb.length;h++)u.__h.push(u._sb[h]);u._sb=[]}else do u.__d=!1,z&&z(n),c=u.render(u.props,u.state,u.context),u.state=u.__s;while(u.__d&&++C<25);u.state=u.__s,u.getChildContext!=null&&(r=oe(oe({},r),u.getChildContext())),T&&!g&&u.getSnapshotBeforeUpdate!=null&&(_=u.getSnapshotBeforeUpdate(f,m)),H=c,c!=null&&c.type===M&&c.key==null&&(H=Ft(c.props.children)),l=Pt(e,Ne(H)?H:[H],n,o,r,a,s,i,l,d,p),u.base=n.__e,n.__u&=-161,u.__h.length&&i.push(u),v&&(u.__E=u.__=null)}catch($){if(n.__v=null,d||s!=null)if($.then){for(n.__u|=d?160:128;l&&l.nodeType==8&&l.nextSibling;)l=l.nextSibling;s[s.indexOf(l)]=null,n.__e=l}else{for(Y=s.length;Y--;)et(s[Y]);Je(n)}else n.__e=o.__e,n.__k=o.__k,$.then||Je(n);F.__e($,n,o)}else s==null&&n.__v==o.__v?(n.__k=o.__k,n.__e=o.__e):l=n.__e=Kn(o.__e,n,o,r,a,s,i,d,p);return(c=F.diffed)&&c(n),128&n.__u?void 0:l}function Je(e){e&&e.__c&&(e.__c.__e=!0),e&&e.__k&&e.__k.forEach(Je)}function At(e,n,o){for(var r=0;r<o.length;r++)nt(o[r],o[++r],o[++r]);F.__c&&F.__c(n,e),e.some(function(a){try{e=a.__h,a.__h=[],e.some(function(s){s.call(a)})}catch(s){F.__e(s,a.__v)}})}function Ft(e){return typeof e!="object"||e==null||e.__b&&e.__b>0?e:Ne(e)?e.map(Ft):oe({},e)}function Kn(e,n,o,r,a,s,i,l,d){var p,c,u,g,f,m,_,v=o.props,w=n.props,T=n.type;if(T=="svg"?a="http://www.w3.org/2000/svg":T=="math"?a="http://www.w3.org/1998/Math/MathML":a||(a="http://www.w3.org/1999/xhtml"),s!=null){for(p=0;p<s.length;p++)if((f=s[p])&&"setAttribute"in f==!!T&&(T?f.localName==T:f.nodeType==3)){e=f,s[p]=null;break}}if(e==null){if(T==null)return document.createTextNode(w);e=document.createElementNS(a,T,w.is&&w),l&&(F.__m&&F.__m(n,s),l=!1),s=null}if(T==null)v===w||l&&e.data==w||(e.data=w);else{if(s=s&&Oe.call(e.childNodes),v=o.props||ve,!l&&s!=null)for(v={},p=0;p<e.attributes.length;p++)v[(f=e.attributes[p]).name]=f.value;for(p in v)if(f=v[p],p!="children"){if(p=="dangerouslySetInnerHTML")u=f;else if(!(p in w)){if(p=="value"&&"defaultValue"in w||p=="checked"&&"defaultChecked"in w)continue;Fe(e,p,null,f,a)}}for(p in w)f=w[p],p=="children"?g=f:p=="dangerouslySetInnerHTML"?c=f:p=="value"?m=f:p=="checked"?_=f:l&&typeof f!="function"||v[p]===f||Fe(e,p,f,v[p],a);if(c)l||u&&(c.__html==u.__html||c.__html==e.innerHTML)||(e.innerHTML=c.__html),n.__k=[];else if(u&&(e.innerHTML=""),Pt(n.type=="template"?e.content:e,Ne(g)?g:[g],n,o,r,T=="foreignObject"?"http://www.w3.org/1999/xhtml":a,s,i,s?s[0]:o.__k&&he(o,0),l,d),s!=null)for(p=s.length;p--;)et(s[p]);l||(p="value",T=="progress"&&m==null?e.removeAttribute("value"):m!=null&&(m!==e[p]||T=="progress"&&!m||T=="option"&&m!=v[p])&&Fe(e,p,m,v[p],a),p="checked",_!=null&&_!=e[p]&&Fe(e,p,_,v[p],a))}return e}function nt(e,n,o){try{if(typeof e=="function"){var r=typeof e.__u=="function";r&&e.__u(),r&&n==null||(e.__u=e(n))}else e.current=n}catch(a){F.__e(a,o)}}function Et(e,n,o){var r,a;if(F.unmount&&F.unmount(e),(r=e.ref)&&(r.current&&r.current!=e.__e||nt(r,null,n)),(r=e.__c)!=null){if(r.componentWillUnmount)try{r.componentWillUnmount()}catch(s){F.__e(s,n)}r.base=r.__P=null}if(r=e.__k)for(a=0;a<r.length;a++)r[a]&&Et(r[a],n,o||typeof e.type!="function");o||et(e.__e),e.__c=e.__=e.__e=void 0}function Gn(e,n,o){return this.constructor(e,o)}function Rt(e,n,o){var r,a,s,i;n==document&&(n=document.documentElement),F.__&&F.__(e,n),a=(r=typeof o=="function")?null:o&&o.__k||n.__k,s=[],i=[],tt(n,e=(!r&&o||n).__k=Wn(M,null,[e]),a||ve,ve,n.namespaceURI,!r&&o?[o]:a?null:n.firstChild?Oe.call(n.childNodes):null,s,!r&&o?o:a?a.__e:n.firstChild,r,i),At(s,e,i)}Oe=Tt.slice,F={__e:function(e,n,o,r){for(var a,s,i;n=n.__;)if((a=n.__c)&&!a.__)try{if((s=a.constructor)&&s.getDerivedStateFromError!=null&&(a.setState(s.getDerivedStateFromError(e)),i=a.__d),a.componentDidCatch!=null&&(a.componentDidCatch(e,r||{}),i=a.__d),i)return a.__E=a}catch(l){e=l}throw e}},St=0,zn=function(e){return e!=null&&e.constructor==null},Re.prototype.setState=function(e,n){var o;o=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=oe({},this.state),typeof e=="function"&&(e=e(oe({},o),this.props)),e&&oe(o,e),e!=null&&this.__v&&(n&&this._sb.push(n),vt(this))},Re.prototype.forceUpdate=function(e){this.__v&&(this.__e=!0,e&&this.__h.push(e),vt(this))},Re.prototype.render=M,le=[],_t=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,kt=function(e,n){return e.__v.__b-n.__v.__b},Ce.__r=0,Mt=/(PointerCapture)$|Capture$/i,Ze=0,Qe=xt(!1),Xe=xt(!0),Un=0;var Ie,O,ot,Ct,st=0,Ut=[],B=F,Ot=B.__b,Nt=B.__r,Dt=B.diffed,It=B.__c,Bt=B.unmount,Ht=B.__;function qt(e,n){B.__h&&B.__h(O,e,st||n),st=0;var o=O.__H||(O.__H={__:[],__h:[]});return e>=o.__.length&&o.__.push({}),o.__[e]}function b(e){return st=1,Yn(Wt,e)}function Yn(e,n,o){var r=qt(Ie++,2);if(r.t=e,!r.__c&&(r.__=[o?o(n):Wt(void 0,n),function(l){var d=r.__N?r.__N[0]:r.__[0],p=r.t(d,l);d!==p&&(r.__N=[p,r.__[1]],r.__c.setState({}))}],r.__c=O,!O.__f)){var a=function(l,d,p){if(!r.__c.__H)return!0;var c=r.__c.__H.__.filter(function(g){return!!g.__c});if(c.every(function(g){return!g.__N}))return!s||s.call(this,l,d,p);var u=r.__c.props!==l;return c.forEach(function(g){if(g.__N){var f=g.__[0];g.__=g.__N,g.__N=void 0,f!==g.__[0]&&(u=!0)}}),s&&s.call(this,l,d,p)||u};O.__f=!0;var s=O.shouldComponentUpdate,i=O.componentWillUpdate;O.componentWillUpdate=function(l,d,p){if(this.__e){var c=s;s=void 0,a(l,d,p),s=c}i&&i.call(this,l,d,p)},O.shouldComponentUpdate=a}return r.__N||r.__}function A(e,n){var o=qt(Ie++,3);!B.__s&&Jn(o.__H,n)&&(o.__=e,o.u=n,O.__H.__h.push(o))}function Qn(){for(var e;e=Ut.shift();)if(e.__P&&e.__H)try{e.__H.__h.forEach(De),e.__H.__h.forEach(rt),e.__H.__h=[]}catch(n){e.__H.__h=[],B.__e(n,e.__v)}}B.__b=function(e){O=null,Ot&&Ot(e)},B.__=function(e,n){e&&n.__k&&n.__k.__m&&(e.__m=n.__k.__m),Ht&&Ht(e,n)},B.__r=function(e){Nt&&Nt(e),Ie=0;var n=(O=e.__c).__H;n&&(ot===O?(n.__h=[],O.__h=[],n.__.forEach(function(o){o.__N&&(o.__=o.__N),o.u=o.__N=void 0})):(n.__h.forEach(De),n.__h.forEach(rt),n.__h=[],Ie=0)),ot=O},B.diffed=function(e){Dt&&Dt(e);var n=e.__c;n&&n.__H&&(n.__H.__h.length&&(Ut.push(n)!==1&&Ct===B.requestAnimationFrame||((Ct=B.requestAnimationFrame)||Xn)(Qn)),n.__H.__.forEach(function(o){o.u&&(o.__H=o.u),o.u=void 0})),ot=O=null},B.__c=function(e,n){n.some(function(o){try{o.__h.forEach(De),o.__h=o.__h.filter(function(r){return!r.__||rt(r)})}catch(r){n.some(function(a){a.__h&&(a.__h=[])}),n=[],B.__e(r,o.__v)}}),It&&It(e,n)},B.unmount=function(e){Bt&&Bt(e);var n,o=e.__c;o&&o.__H&&(o.__H.__.forEach(function(r){try{De(r)}catch(a){n=a}}),o.__H=void 0,n&&B.__e(n,o.__v))};var zt=typeof requestAnimationFrame=="function";function Xn(e){var n,o=function(){clearTimeout(r),zt&&cancelAnimationFrame(n),setTimeout(e)},r=setTimeout(o,35);zt&&(n=requestAnimationFrame(o))}function De(e){var n=O,o=e.__c;typeof o=="function"&&(e.__c=void 0,o()),O=n}function rt(e){var n=O;e.__c=e.__(),O=n}function Jn(e,n){return!e||e.length!==n.length||n.some(function(o,r){return o!==e[r]})}function Wt(e,n){return typeof n=="function"?n(e):n}function j(e,n=3){return e==null||!Number.isFinite(e)?"\\u2014":(e/1e9).toFixed(n)}function jt(e,n=3){let o=e/1e9;return`${o>0?"+":""}${o.toFixed(n)}`}function y(e,n=0,o=!1){if(e==null||!Number.isFinite(e))return"\\u2014";let r=e*100;return`${o&&r>0?"+":""}${r.toFixed(n)}%`}function se(e,n=0){return e==null||!Number.isFinite(e)?"\\u2014":e.toLocaleString(void 0,{maximumFractionDigits:n,minimumFractionDigits:n})}function ee(e,n){return Number.isFinite(e)?n>0?Zn(e*n):`${e>=100?e.toFixed(0):e.toFixed(1)} SOL`:"\\u2014"}function Zn(e){if(!Number.isFinite(e))return"\\u2014";let n=Math.abs(e);return n>=1e9?`$${(e/1e9).toFixed(2)}B`:n>=1e6?`$${(e/1e6).toFixed(n>=1e7?1:2)}M`:n>=1e3?`$${(e/1e3).toFixed(n>=1e5?0:1)}k`:`$${e.toFixed(0)}`}function ae(e){return Number.isFinite(e)?e<60?`${Math.max(0,Math.round(e))}s`:e<3600?`${Math.round(e/60)}m`:e<86400?`${(e/3600).toFixed(1)}h`:`${(e/86400).toFixed(1)}d`:"\\u2014"}function Q(e,n=Date.now()){return e?`${ae((n-e)/1e3)} ago`:"\\u2014"}function ce(e){return e?e.length>10?`${e.slice(0,4)}\\u2026${e.slice(-4)}`:e:"\\u2014"}function fe(e){return new Date(e).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}var Vt=e=>e>=75?"b3":e>=60?"b2":"b1";var N={demo:!1,moreTabs:[]};var ge={authed:null,settings:null,account:null,rows:[],health:null,funnelHour:null,funnelDay:null,signals:[],connected:!1,solUsd:0,lastUpdate:0,skew:0,toast:"",nav:null},it=new Set;function lt(){return ge}function V(e){ge={...ge,...e};for(let n of it)n()}function P(e){let[,n]=b(0);return A(()=>{let o=()=>n(r=>r+1);return it.add(o),()=>void it.delete(o)},[]),e(ge)}var at=null;function S(e){V({toast:e}),at&&clearTimeout(at),at=setTimeout(()=>V({toast:""}),3200)}function ue(e,n){V({nav:{tab:e,sub:n,at:Date.now()}})}var eo={async request(e,n){let o=await fetch(e,{method:n===void 0?"GET":"POST",credentials:"same-origin",headers:n===void 0?{accept:"application/json"}:{"content-type":"application/json","x-signal":"1"},body:n===void 0?void 0:JSON.stringify(n)});return{status:o.status,json:await o.json().catch(()=>({}))}},stream(e,n,o){let r=new EventSource("/api/stream");r.addEventListener("open",n),r.addEventListener("error",o);for(let a of["hello","radar","health","settings","signal","position"])r.addEventListener(a,s=>e(a,JSON.parse(s.data)));return()=>r.close()}},Kt=eo;async function k(e,n){let{status:o,json:r}=await Kt.request(e,n);if(o===401)throw V({authed:!1}),new Error("login required");if(o>=400)throw new Error(r?.error??`HTTP ${o}`);return r}async function q(){try{let e=await k("/api/state");V({authed:!0,settings:e.settings,account:e.account,health:e.health,funnelHour:e.funnel.hour,funnelDay:e.funnel.day,signals:e.signals,solUsd:e.solUsd||ge.solUsd,skew:Date.now()-e.serverTime,lastUpdate:Date.now()})}catch{}}var Be=null;function He(){Be?.(),Be=Kt.stream((e,n)=>{switch(e){case"hello":V({settings:n.settings,account:n.account,rows:n.rows,connected:!0,lastUpdate:Date.now(),skew:Date.now()-n.serverTime});break;case"radar":V({rows:n.rows,account:n.account,lastUpdate:Date.now(),connected:!0});break;case"health":V({health:n});break;case"settings":V({settings:n});break;case"signal":V({signals:[n,...ge.signals.filter(o=>o.id!==n.id)].slice(0,200)});break;case"position":{let{position:o,what:r}=n;r==="fill"&&o.fills?.length===1&&S(`Bought $${o.symbol||"coin"} \\xB7 score ${Math.round(o.signalScore)}`),r==="close"&&S(`Sold $${o.symbol||"coin"} \\xB7 ${o.exitReason} \\xB7 ${(o.pnlPct??0).toFixed(1)}%`);break}}},()=>V({connected:!0}),()=>V({connected:!1}))}function Gt(){Be?.(),Be=null}var to=0,ss=Array.isArray;function t(e,n,o,r,a,s){n||(n={});var i,l,d=n;if("ref"in d)for(l in d={},n)l=="ref"?i=n[l]:d[l]=n[l];var p={type:e,props:d,key:o,ref:i,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--to,__i:-1,__u:0,__source:a,__self:s};if(typeof e=="function"&&(i=e.defaultProps))for(l in i)d[l]===void 0&&(d[l]=i[l]);return F.vnode&&F.vnode(p),p}function ze({value:e,small:n}){return t("div",{class:`score ${Vt(e)}`,"aria-label":`score ${Math.round(e)}`,children:[Math.round(e),n&&t("small",{children:n})]})}function re({id:e,checked:n,onChange:o,label:r,disabled:a}){return t("label",{class:"switch",title:r,children:[t("input",{id:e,type:"checkbox",checked:n,disabled:a,"aria-label":r,onChange:s=>o(s.target.checked)}),t("span",{})]})}function E({label:e,help:n,children:o,htmlFor:r}){return t("div",{class:"field",children:[t("div",{class:"row",children:[t("label",{for:r,style:"flex:1",children:e}),t("div",{class:"ctrl",children:o})]}),n&&t("div",{class:"help",children:n})]})}function R({id:e,value:n,onChange:o,step:r=1,min:a,max:s,suffix:i,disabled:l}){return t("span",{class:"row",style:"gap:6px",children:[t("input",{id:e,class:"inp",type:"number",inputMode:"decimal",value:n,step:r,min:a,max:s,disabled:l,onInput:d=>{let p=Number(d.target.value);Number.isFinite(p)&&o(p)}}),i&&t("span",{class:"muted",children:i})]})}function we({k:e,v:n,s:o,tone:r}){return t("div",{class:"stat",children:[t("div",{class:"k",children:e}),t("div",{class:`v num ${r??""}`,children:n}),o!==void 0&&t("div",{class:"s",children:o})]})}function x({children:e,tone:n}){return t("span",{class:`tag ${n??""}`,children:e})}function Yt({points:e,height:n=64}){if(e.length<2)return t("div",{class:"empty",style:"padding:12px",children:"Equity line appears after the first closed trade."});let o=600,r=n,a=e.map(w=>w.t),s=e.map(w=>w.v),i=Math.min(...a),l=Math.max(...a),d=Math.min(...s),p=Math.max(...s),c=(p-d)*.1||Math.abs(p)*.01||1,u=w=>(w-i)/Math.max(1,l-i)*(o-8)+4,g=w=>r-4-(w-(d-c))/(p+c-(d-c))*(r-8),f=e.map((w,T)=>`${T?"L":"M"}${u(w.t).toFixed(1)},${g(w.v).toFixed(1)}`).join(" "),m=e[e.length-1],v=m.v>=e[0].v?"var(--good)":"var(--bad)";return t("svg",{class:"spark",viewBox:`0 0 ${o} ${r}`,preserveAspectRatio:"none",role:"img","aria-label":"equity over time",children:[t("line",{x1:"0",x2:o,y1:g(e[0].v),y2:g(e[0].v),stroke:"var(--line2)","stroke-dasharray":"3 4","stroke-width":"1"}),t("path",{d:`${f} L${u(m.t)},${r} L${u(e[0].t)},${r} Z`,fill:v,opacity:"0.12"}),t("path",{d:f,fill:"none",stroke:v,"stroke-width":"2","vector-effect":"non-scaling-stroke"}),t("circle",{cx:u(m.t),cy:g(m.v),r:"4",fill:v})]})}function Qt({bins:e,threshold:n}){let o=Math.max(1,...e);return t("div",{children:[t("div",{class:"hist",role:"img","aria-label":"score distribution",children:e.map((r,a)=>t("i",{class:a*10+10>n?"hot":"",style:{height:`${Math.max(3,r/o*100)}%`},title:`${a*10}\\u2013${a*10+9}: ${r}`},a))}),t("div",{class:"row faint",style:"justify-content:space-between;font-size:11px;margin-top:4px",children:[t("span",{children:"0"}),t("span",{children:"50"}),t("span",{children:"100"})]})]})}function D({children:e}){return t("div",{class:"empty",children:e})}var Xt={radar:t("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:[t("circle",{cx:"12",cy:"12",r:"9"}),t("circle",{cx:"12",cy:"12",r:"4.5"}),t("path",{d:"M12 12l6-6"})]}),trades:t("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:[t("path",{d:"M3 17l6-6 4 4 8-8"}),t("path",{d:"M14 7h7v7"})]}),bot:t("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:[t("rect",{x:"4",y:"7",width:"16",height:"12",rx:"3"}),t("path",{d:"M12 3v4M9 12h.01M15 12h.01M9 16h6"})]}),learn:t("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:t("path",{d:"M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6"})}),more:t("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:[t("circle",{cx:"5",cy:"12",r:"1.5"}),t("circle",{cx:"12",cy:"12",r:"1.5"}),t("circle",{cx:"19",cy:"12",r:"1.5"})]})};var xe={initialVirtualTok:1073e12,initialVirtualSol:3e10,initialRealTok:7931e11,supply:1e15},us=(()=>{let e=xe.initialVirtualSol*xe.initialVirtualTok,n=xe.initialVirtualTok-xe.initialRealTok;return e/n-xe.initialVirtualSol})();var Se=(e,n,o)=>e<n?n:e>o?o:e;var _e=[25,50,75,100,150,200,300,500],ke=[10,20,30,40,50,70],K=_e.flatMap(e=>ke.map(n=>({tp:e,sl:n})));var qe=[5,10,30,60,120],de=[50,55,60,65,70,75,80,85,90,95];var Ms=1+K.length,Ts=Float64Array.from(K,e=>1+e.tp/100),$s=Float64Array.from(K,e=>1-e.sl/100);var X=e=>`${(e*100).toFixed(e<.1?1:0)}%`,Me=e=>Math.abs(e)>=10?e.toFixed(0):e.toFixed(2),so=[{key:"age",label:"Age",x:e=>Math.log1p(e.ageSec),show:e=>We(e.ageSec),good:"young",bad:"old for its stage"},{key:"mcap",label:"Market cap",x:e=>Math.log(Math.max(e.mcapSol,1)),show:e=>`${e.mcapSol.toFixed(0)} SOL`,good:"room to run",bad:"already big"},{key:"progress",label:"Curve progress",x:e=>e.progress,show:e=>X(e.progress),good:"curve filling",bad:"curve nearly done"},{key:"net60",label:"Net inflow 60s",x:e=>Math.asinh(e.net60),show:e=>`${Me(e.net60)} SOL`,good:"buyers pouring in",bad:"net selling"},{key:"net300",label:"Net inflow 5m",x:e=>Math.asinh(e.net300),show:e=>`${Me(e.net300)} SOL`,good:"sustained demand",bad:"demand fading"},{key:"accel",label:"Acceleration",x:e=>Se((e.net60-e.netPrev60)/(Math.abs(e.netPrev60)+1),-3,3),show:e=>`${Me(e.net60-e.netPrev60)} SOL vs prior min`,good:"speeding up",bad:"slowing down"},{key:"buyRatio",label:"Buy share 60s",x:e=>(e.buys60+1)/(e.buys60+e.sells60+2),show:e=>`${e.buys60}B/${e.sells60}S`,good:"mostly buys",bad:"mostly sells"},{key:"uniq60",label:"New buyers 60s",x:e=>Math.log1p(e.uniq60),show:e=>`${e.uniq60}`,good:"many distinct buyers",bad:"few buyers"},{key:"uniqTotal",label:"Buyers total",x:e=>Math.log1p(e.uniqTotal),show:e=>`${e.uniqTotal}`,good:"broad participation",bad:"thin participation"},{key:"trades60",label:"Trades 60s",x:e=>Math.log1p(e.trades60),show:e=>`${e.trades60}`,good:"active",bad:"quiet"},{key:"avgBuy",label:"Avg buy 5m",x:e=>Math.log(.01+e.avgBuy300),show:e=>`${Me(e.avgBuy300)} SOL`,good:"retail-sized buys",bad:"whale-sized buys"},{key:"whale",label:"Largest buy share",x:e=>e.whale300,show:e=>X(e.whale300),good:"no single whale",bad:"one whale dominates"},{key:"devShare",label:"Dev holds",x:e=>e.devShare,show:e=>X(e.devShare),good:"dev holds little",bad:"dev holds a lot"},{key:"devSold",label:"Dev sold",x:e=>e.devSold,show:e=>X(e.devSold),good:"dev holding",bad:"dev dumping"},{key:"bundle",label:"Bundled supply",x:e=>e.bundleShare,show:e=>X(e.bundleShare),good:"no bundle",bad:"bundled at launch"},{key:"early",label:"Sniper supply",x:e=>e.earlyShare,show:e=>X(e.earlyShare),good:"snipers gone",bad:"snipers holding"},{key:"top10",label:"Top 10 holders",x:e=>e.top10,show:e=>X(e.top10),good:"spread out",bad:"concentrated"},{key:"holders",label:"Holders",x:e=>Math.log1p(e.holders),show:e=>`${e.holders}`,good:"many holders",bad:"few holders"},{key:"drawdown",label:"Below peak",x:e=>e.drawdown,show:e=>X(e.drawdown),good:"near highs",bad:"far below peak"},{key:"chg30",label:"Move 30s",x:e=>Se(e.chg30,-2,2),show:e=>X(Math.exp(e.chg30)-1),good:"rising",bad:"falling"},{key:"chg120",label:"Move 2m",x:e=>Se(e.chg120,-2,2),show:e=>X(Math.exp(e.chg120)-1),good:"trending up",bad:"trending down"},{key:"smart",label:"Smart wallets in",x:e=>Math.log1p(e.smartBuyers),show:e=>`${e.smartBuyers}`,good:"proven wallets buying",bad:""},{key:"fresh",label:"Fresh wallets",x:e=>Number.isFinite(e.freshShare)?e.freshShare:.3,show:e=>Number.isFinite(e.freshShare)?X(e.freshShare):"learning",good:"real wallets",bad:"brand-new wallets (alts)"},{key:"socials",label:"Socials",x:e=>e.socials/3,show:e=>`${e.socials}/3`,good:"has socials",bad:"no socials"},{key:"tweet",label:"Tweet-linked",x:e=>e.tweetLink,show:e=>e.tweetLink?"yes":"no",good:"anchored to a tweet",bad:""},{key:"cluster",label:"Narrative heat",x:e=>Math.log(Math.max(1,e.clusterSize)),show:e=>`${e.clusterSize} similar`,good:"hot narrative",bad:""},{key:"leader",label:"Narrative leader",x:e=>e.isLeader,show:e=>e.isLeader?"leads":"\\u2014",good:"leads its narrative",bad:""},{key:"copycat",label:"Copycat",x:e=>e.clusterSize>1&&!e.isLeader?1:0,show:e=>e.clusterSize>1&&!e.isLeader?"yes":"no",good:"",bad:"copy of a bigger coin"},{key:"serial",label:"Serial launcher",x:e=>Math.log1p(Math.max(0,e.creatorLaunches24h-1)),show:e=>`${e.creatorLaunches24h} launches/24h`,good:"",bad:"dev launches many coins"},{key:"creatorBest",label:"Dev track record",x:e=>Math.log1p(e.creatorBest/100),show:e=>`best ${e.creatorBest.toFixed(0)} SOL`,good:"dev had a winner",bad:""},{key:"heat",label:"Market heat",x:e=>e.heat,show:e=>Me(e.heat),good:"hot market",bad:"cold market"},{key:"hourSin",label:"Hour (sin)",x:e=>Math.sin(2*Math.PI*e.hourUtc/24),show:e=>`${e.hourUtc.toFixed(0)}h UTC`,good:"",bad:""},{key:"hourCos",label:"Hour (cos)",x:e=>Math.cos(2*Math.PI*e.hourUtc/24),show:e=>`${e.hourUtc.toFixed(0)}h UTC`,good:"",bad:""},{key:"liquidity",label:"Liquidity",x:e=>Math.log1p(e.liquiditySol),show:e=>`${e.liquiditySol.toFixed(1)} SOL`,good:"deep pool",bad:"thin pool"},{key:"sinceMig",label:"Since migration",x:e=>e.stage==="amm"?Math.log1p(e.sinceMigrateSec):0,show:e=>e.stage==="amm"?We(e.sinceMigrateSec):"\\u2014",good:"just graduated",bad:"stale after graduation"},{key:"dex",label:"DEX listing paid",x:e=>e.dexSignal,show:e=>`${e.dexSignal}/2`,good:"paid profile/boost",bad:""}],be=so.map(e=>e.key);function We(e){return e<90?`${Math.round(e)}s`:e<5400?`${Math.round(e/60)}m`:e<172800?`${(e/3600).toFixed(1)}h`:`${(e/86400).toFixed(1)}d`}var ie={age20:"20 s after launch",age45:"45 s after launch",age90:"90 s after launch",age180:"3 min after launch",age360:"6 min after launch",age720:"12 min after launch",prog25:"a quarter of the way to graduation",prog50:"halfway to graduation",prog75:"three quarters of the way to graduation",mig60:"1 min after graduating",mig300:"5 min after graduating",mig900:"15 min after graduating",mig3600:"1 h after graduating"};var Jt={age:[10,86400],mig:[30,86400]};function Zt(e){return e<120?Math.round(e):e<7200?Math.round(e/30)*30:Math.round(e/1800)*1800}function Ve(e){let n=/^(age|mig)(\\d{1,6})$/.exec(e);if(!n||e in ie)return null;let o=n[1],r=Number(n[2]),[a,s]=Jt[o];return r>=a&&r<=s&&Zt(r)===r?{kind:o,sec:r}:null}function en(e,n){let[o,r]=Jt[e];return`${e}${Zt(Math.min(r,Math.max(o,n)))}`}var ro=e=>e<120?`${e} s`:e<7200?`${+(e/60).toFixed(1)} min`:`${+(e/3600).toFixed(1)} h`;function te(e){let n=ie[e];if(n)return n;let o=Ve(e);return o?`${ro(o.sec)} after ${o.kind==="age"?"launch":"graduating"}`:e}var tn=["entryAt","conds","minScore","tpPct","slPct","maxHoldMin","trailPct","takeInitials","reentry","tradeCurve","tradeAmm","scoreOnly","filters"];function je(e){let n={};for(let o of tn)n[o]=o==="filters"?{...e.filters}:o==="conds"?(e.conds??[]).map(r=>({...r})):e[o];return n}function ct(e,n){return JSON.stringify(je(e))!==JSON.stringify(je(n))}function ut(e,n){let o={};for(let a of Object.keys(e))a!=="filters"&&(a==="conds"||a==="moments"?JSON.stringify(e[a])!==JSON.stringify(n[a]):e[a]!==n[a])&&(o[a]=e[a]);let r={};for(let a of Object.keys(e.filters))e.filters[a]!==n.filters[a]&&(r[a]=e.filters[a]);return Object.keys(r).length&&(o.filters=r),o}function nn(e,n,o){let r=ut(e,n);return{...o,...r,filters:{...o.filters,...r.filters??{}}}}var pe=[0,10,30,60],lo=K.length*pe.length,J=e=>e.f,an=[{key:"any",label:"any coin",test:()=>!0},{key:"curve",label:"still on the bonding curve",test:e=>e.stage==="curve",stage:"curve"},{key:"amm",label:"already graduated",test:e=>e.stage==="amm",stage:"amm"},...[40,80,150].map(e=>({key:`mcap<=${e}`,label:`market cap \\u2264 ${e} SOL`,test:n=>J(n).mcap<=e,filters:{maxMcapSol:e}})),...[80,150,300].map(e=>({key:`mcap>=${e}`,label:`market cap \\u2265 ${e} SOL`,test:n=>J(n).mcap>=e,filters:{minMcapSol:e}})),...[1,3,10].map(e=>({key:`age<=${e}m`,label:`younger than ${e} min`,test:n=>J(n).age<=e*60,filters:{maxAgeMin:e}})),...[3,10].map(e=>({key:`age>=${e}m`,label:`older than ${e} min`,test:n=>J(n).age>=e*60,filters:{minAgeSec:e*60}})),{key:"bundle<=10",label:"\\u2264 10% bundled at launch",test:e=>J(e).bundle*100<=10,filters:{maxBundlePct:10}},{key:"top10<=30",label:"top 10 holders own \\u2264 30%",test:e=>J(e).top10*100<=30,filters:{maxTop10Pct:30}},...[30,100].map(e=>({key:`buyers>=${e}`,label:`${e}+ buyers`,test:n=>J(n).buyers>=e,filters:{minBuyers:e}})),{key:"socials",label:"has socials",test:e=>J(e).socials>0,filters:{requireSocials:!0}},{key:"dev<=5",label:"dev holds \\u2264 5%",test:e=>J(e).devShare*100<=5,filters:{maxDevPct:5}},{key:"devheld",label:"dev hasn\'t sold",test:e=>J(e).devSold<=0,filters:{maxDevSoldPct:0}},{key:"onelaunch",label:"dev\'s only launch today",test:e=>J(e).launches24h<=1,filters:{maxDevLaunches24h:1}}];var Ks={horizonMs:6*36e5,minHours:24,minSamples:1e3,minDiscovery:80,minHoldout:40,candidates:20,minWins:10,placeboRuns:3,seed:7};function ln(e,n){return e.entryAt==="score"&&!de.includes(e.minScore)?`score ${e.minScore} is not one of the levels the bot records (${de.join(", ")})`:e.entryAt==="score"&&e.reentry?"buying the same coin again is not recorded":K.some(o=>o.tp===e.tpPct&&o.sl===e.slPct)?po(e,n)===null?`a time limit of ${e.maxHoldMin} min is not among the ones the bot records (${qe.join(", ")} min, ${Math.round(n/36e5)} h or none)`:e.trailPct>0?"a trailing stop is not recorded":e.takeInitials?"taking the initials out is not recorded":null:`+${e.tpPct}% / \\u2212${e.slPct}% is not among the exits the bot records (take profit ${co}; stop loss ${uo})`}var co=[...new Set(K.map(e=>e.tp))].map(e=>`${e}%`).join(", "),uo=[...new Set(K.map(e=>e.sl))].map(e=>`${e}%`).join(", ");function po(e,n){return e.maxHoldMin===0||e.maxHoldMin*6e4>=n?0:qe.includes(e.maxHoldMin)?e.maxHoldMin:null}var dt=864e5,nr=be.length,mo=pe.length,$e={maxActive:20,mineMax:5,newPerRun:3,looks:[60,120,240,480],alpha:5e-4,minWins:10,maxAgeMs:7*dt,provenMs:14*dt,postMin:40,minSeen:60,minHours:24,minRows:1e3,quantiles:[.1,.25,.5,.75,.9],screenTop:16,pairTop:8,retryAfterMs:3*dt,keepRetired:30,keepVals:3e3};var ye=e=>e===0||!Number.isFinite(e)?0:Number(e.toPrecision(2)),ho=e=>`${e>=0?"+":""}${Math.round(e*100)}%`,ne=(e,n)=>({key:e,label:n,raw:o=>o,x:o=>o,nice:o=>Math.round(o*100)/100,show:o=>`${Math.round(o*100)}%`,pct:!0}),Te=(e,n)=>({key:e,label:n,raw:Math.expm1,x:o=>Math.log1p(Math.max(0,o)),nice:o=>o>=10?ye(o):Math.round(o),show:o=>`${Math.round(o)}`}),cn=(e,n)=>({key:e,label:n,raw:Math.sinh,x:Math.asinh,nice:ye,show:o=>`${o} SOL`}),un=(e,n)=>({key:e,label:n,raw:o=>Math.exp(o)-1,x:o=>Math.max(-2,Math.min(2,Math.log(1+Math.max(-.99,o)))),nice:o=>Math.round(o*100)/100,show:ho,pct:!0}),pt=(e,n)=>({key:e,label:n,raw:o=>o,x:o=>o,nice:o=>o>=.5?1:0,show:o=>o>=.5?"yes":"no",yesNo:!0}),Pe=[{key:"age",label:"Age",raw:Math.expm1,x:e=>Math.log1p(Math.max(0,e)),nice:e=>e<90?Math.round(e/5)*5:e<5400?Math.round(e/60)*60:Math.round(e/600)*600,show:We},{key:"mcap",label:"Market cap",raw:Math.exp,x:e=>Math.log(Math.max(e,1)),nice:ye,show:e=>`${e} SOL`},ne("progress","Curve progress"),cn("net60","Net inflow 60s"),cn("net300","Net inflow 5m"),{key:"accel",label:"Acceleration",raw:e=>e,x:e=>e,nice:e=>Math.round(e*10)/10,show:e=>e.toFixed(1)},ne("buyRatio","Buy share 60s"),Te("uniq60","New buyers 60s"),Te("uniqTotal","Buyers total"),Te("trades60","Trades 60s"),{key:"avgBuy",label:"Avg buy 5m",raw:e=>Math.exp(e)-.01,x:e=>Math.log(.01+Math.max(0,e)),nice:ye,show:e=>`${e} SOL`},ne("whale","Largest buy share"),ne("devShare","Dev holds"),ne("devSold","Dev sold"),ne("bundle","Bundled supply"),ne("early","Sniper supply"),ne("top10","Top 10 holders"),Te("holders","Holders"),ne("drawdown","Below peak"),un("chg30","Move 30s"),un("chg120","Move 2m"),Te("smart","Smart wallets in"),ne("fresh","Fresh wallets"),{key:"socials",label:"Socials",raw:e=>e*3,x:e=>e/3,nice:e=>Math.round(e),show:e=>`${Math.round(e)} of 3`},pt("tweet","Tweet-linked"),{key:"cluster",label:"Narrative heat",raw:Math.exp,x:e=>Math.log(Math.max(1,e)),nice:e=>Math.round(e),show:e=>`${Math.round(e)} similar coins`},pt("leader","Narrative leader"),pt("copycat","Copycat"),{key:"serial",label:"Dev launches in 24 h",raw:e=>Math.expm1(e)+1,x:e=>Math.log1p(Math.max(0,e-1)),nice:e=>Math.round(e),show:e=>`${Math.round(e)}`},{key:"creatorBest",label:"Dev\'s best coin",raw:e=>Math.expm1(e)*100,x:e=>Math.log1p(Math.max(0,e)/100),nice:ye,show:e=>`${e} SOL`},{key:"heat",label:"Market heat",raw:e=>e,x:e=>e,nice:e=>Math.round(e*100)/100,show:e=>e.toFixed(2)},{key:"liquidity",label:"Liquidity",raw:Math.expm1,x:e=>Math.log1p(Math.max(0,e)),nice:ye,show:e=>`${e} SOL`},{key:"dex",label:"DEX listing paid",raw:e=>e,x:e=>e,nice:e=>Math.round(e),show:e=>`${Math.round(e)} of 2`}],fo=new Map(Pe.map(e=>[e.key,e])),or=Pe.map(e=>be.indexOf(e.key));function dn(e){let n=fo.get(e.k);if(!n)return e.k;let o=n.raw(e.v);return n.yesNo?e.op===">="?n.label.toLowerCase():`not ${n.label.toLowerCase()}`:`${n.label.toLowerCase()} ${e.op===">="?"\\u2265":"\\u2264"} ${n.show(o)}`}var go=[...new Set(K.map(e=>e.tp))],bo=[...new Set(K.map(e=>e.sl))],sr=`entry, then up to 3 conditions, then the exit \\u2014 e.g. "mig300 top10<=25% smart>=1 tp100 sl30 hold30". Entry: score50\\u2026score95 (the first time the score reaches it) or ${Object.keys(ie).join(", ")}. Optional: stage=curve or stage=amm. Conditions on: ${Pe.map(e=>e.key).join(", ")} (with >= or <=; % for shares; =1 / =0 for yes/no). Take profit tp: ${go.join(", ")}; stop loss sl: ${bo.join(", ")}; time limit hold (minutes): ${pe.filter(e=>e>0).join(", ")}, or none.`;var rr=1-2*$e.alpha;var ar=[[25,10,0],[50,20,0],[50,20,10],[100,30,0],[100,30,30],[100,50,0],[200,50,0],[150,40,60],[300,70,0],[500,50,0]].map(([e,n,o])=>K.findIndex(r=>r.tp===e&&r.sl===n)*mo+pe.indexOf(o)).filter(e=>e>=0);var pn={entryAt:"score",conds:[],trailPct:0,takeInitials:!1,reentry:!1,tradeCurve:!0,tradeAmm:!0,scoreOnly:!0},yo=[{key:"plan",name:"Your plan",note:"Buy when a coin reaches 75 \\xB7 sell at 2\\xD7 or \\u221250% \\xB7 time limit 4 hours. Score only.",proof:"yours",settings:{...pn,minScore:75,tpPct:100,slPct:50,maxHoldMin:240}},{key:"sim-momentum",name:"Simulator finding: fast momentum",note:"Buy when a coin reaches 95 \\xB7 sell at +500% or \\u221220%, or after 10 minutes. It won in the simulator, which has more momentum than pump.fun \\u2014 paper-test it before trusting it.",proof:"unproven",settings:{...pn,minScore:95,tpPct:500,slPct:20,maxHoldMin:10}}];function Ke(e,n){for(let[o,r]of Object.entries(n))if(o==="filters"){for(let[a,s]of Object.entries(r))if(e.filters[a]!==s)return!1}else if(o==="conds"){if(JSON.stringify(e.conds??[])!==JSON.stringify(r??[]))return!1}else if(e[o]!==r)return!1;return!0}function Le(e){let n=e.maxHoldMin>0?e.maxHoldMin>=120&&e.maxHoldMin%60===0?`${e.maxHoldMin/60} h`:`${e.maxHoldMin} min`:"no time limit",o=e.entryAt&&e.entryAt!=="score"?te(e.entryAt):`score \\u2265 ${e.minScore}`,r=e.conds?.length?` \\xB7 ${e.conds.map(dn).join(", ")}`:"";return`${o}${r} \\xB7 +${e.tpPct}% / \\u2212${e.slPct}% \\xB7 ${n}`}var vo=e=>`${e>=0?"+":""}${(e*100).toFixed(1)}%`;function mn(e){let n=e?.survivors?.slice(0,3)??[];return[...yo,...n.map(o=>({key:`edge:${o.text}`,name:"Found in your data",note:`${o.text}. ${vo(o.holdout.mean)} per trade on ${o.holdout.n} trades the search never saw.`,proof:"data",settings:o.settings}))]}function fn({settings:e}){let[n,o]=b(void 0),[r,a]=b(!1),[s,i]=b(!1),[l,d]=b(null),p=()=>k("/api/autopilot").then(f=>o(f.view)).catch(()=>o(null));A(()=>{p();let f=setInterval(p,6e4);return()=>clearInterval(f)},[e.autopilot,e.mode,e.minScore,e.entryAt,e.tpPct,e.slPct,e.maxHoldMin]),A(()=>{if(!n?.own||!("measuring"in n.own))return;let f=setTimeout(p,4e3);return()=>clearTimeout(f)},[n]);let c=e.mode==="live",u=async(f,m)=>{if(c&&l!==m){d(m);return}i(!0);try{await k("/api/settings",f.settings),d(null),S(e.autopilot?"Using it. The autopilot stays on: it keeps this rule unless a proven rule does clearly better.":e.enabled?"Using it for new trades.":"Rule set. Switch Auto-trading on to start."),q(),p()}catch(_){S(String(_.message))}finally{i(!1)}},g=async f=>{if(f&&c&&!r){a(!0);return}i(!0);try{await k("/api/settings",{autopilot:f}),a(!1),S(f?"Autopilot on \\u2014 it trades the best proven rule":"Autopilot off \\u2014 the rule stays as it is"),q(),p()}catch(m){S(String(m.message))}finally{i(!1)}};return n===null?null:t("div",{class:`card ${e.autopilot?"autopilot-on":""}`,style:"margin-top:12px",children:[t("div",{class:"row",style:"align-items:flex-start",children:[t(re,{id:"autopilot",checked:e.autopilot,label:"Autopilot",disabled:s,onChange:g}),t("div",{style:"flex:1",children:[t("div",{style:"font-weight:760;font-size:16px",children:e.autopilot?"Autopilot is on":"Autopilot is off"}),t("div",{class:"muted",style:"font-size:13px",children:"Trades the best rule the edge finder proved on data it never saw, switches as soon as a clearly better one is proven, and drops a rule that stops working in practice. A rule you pick yourself competes too: it stays unless a proven rule does clearly better. It changes the rule only \\u2014 never your trade size, limits or mode."})]}),t(x,{tone:e.autopilot?"good":void 0,children:e.autopilot?"ON":"OFF"})]}),r&&t("div",{class:"note",style:"margin-top:10px",children:[t("b",{children:"You are trading real money."})," With real money the autopilot only uses rules proven at the go-live bar and otherwise holds new entries."," ",t("button",{class:"btn sm danger",disabled:s,onClick:()=>g(!0),children:"Turn on \\u2014 real money"})]}),n&&(e.autopilot||n.log.length>0)&&t(wo,{v:n,on:e.autopilot,use:u,busy:s,confirmRule:l}),!e.autopilot&&t("p",{class:"faint note",children:"Off: the bot trades the rule set below. Turning it on lets it pick the best proven rule by itself \\u2014 your own rule competes with them."})]})}function hn({r:e,id:n,use:o,busy:r,confirmRule:a}){return e.inUse?t(x,{tone:"flare",children:"in use"}):t("button",{class:`btn sm ${a===n?"danger":""}`,disabled:r,onClick:()=>o(e,n),title:e.text,children:a===n?"Tap again \\u2014 real money":"Use this rule"})}function wo({v:e,on:n,use:o,busy:r,confirmRule:a}){let s=e.own;return t("div",{style:"margin-top:10px",children:[n?e.holding?t("div",{class:"entrymoment warn",children:["\\u23F8 ",t("b",{children:"New live entries wait:"})," ",e.holdReason,". Open positions are still managed."]}):e.active&&e.proof?t("div",{class:"entrymoment good",children:[t("b",{children:"Trading:"})," ",e.active,t("div",{style:"font-size:12.5px;margin-top:2px",children:["Since ",Q(e.since)," \\xB7 it showed ",y(e.proof.mean,1,!0)," per trade on ",e.proof.n," trades the search never saw (worst case ",y(e.proof.lo,1,!0),").",e.forward?` On the ${e.forward.n} coins that qualified since: ${y(e.forward.mean,1,!0)} per trade.`:" Judged on its own trades and on the coins that qualify after it, as they finish.",!e.relisted&&e.reportAt>e.since&&" The last search did not list it again \\u2014 that alone is not evidence against it, so it stays until its results say otherwise."]})]}):t("div",{class:"entrymoment",children:[t("b",{children:"On your own rule"})," (",e.rule,") \\u2014 a proven rule replaces it only when it does clearly better",e.reportAt?` \\xB7 last search ${Q(e.reportAt)}`:"",".",t("div",{style:"font-size:12.5px;margin-top:2px",children:s?"measuring"in s?"Measuring your rule on the recordings\\u2026":"why"in s?`Nothing to weigh it by yet: ${s.why}. Until then any proven rule replaces it; its own trades count once it has 30.`:s.from==="trades"?`Weighed by its own ${s.n} trades: ${y(s.mean,1,!0)} each (at least ${y(s.lo,1,!0)}), ~${s.perDay.toFixed(0)} a day \\u2014 at least ~${s.worstSolPerDay.toFixed(2)} SOL a day at your size.`:`Weighed on the newest recordings, the part the search checks its candidates on: ${y(s.mean,1,!0)} per trade on ${s.n} coins (at least ${y(s.lo,1,!0)}), ~${s.perDay.toFixed(0)} trades a day at your limits \\u2014 at least ~${s.worstSolPerDay.toFixed(2)} SOL a day at your size.`:null})]}):null,n&&e.ranking.length>0&&t("details",{class:"more",children:[t("summary",{children:["Proven rules, best first (",e.ranking.length,")"]}),t("p",{class:"faint",style:"font-size:12.5px;margin:0 0 6px",children:["Ranked by what each would earn per day at your size and limits, counted from its worst case on unseen data.",!e.trusted&&" The last search is not used right now: it is too old, was made by an older version of the bot, or its luck check found rules on shuffled data."]}),e.ranking.map(i=>t("div",{class:"edge",children:[t("div",{class:"row wrap",style:"gap:6px",children:[t("span",{class:"edge-rule",style:"flex:1;min-width:0",children:i.text}),e.live&&(i.liveGrade?t(x,{tone:"good",children:"real-money grade"}):t(x,{children:"paper only"})),i.benchedUntil>Date.now()&&t(x,{tone:"bad",children:"benched"}),t(hn,{r:i,id:`rank:${i.text}`,use:o,busy:r,confirmRule:a})]}),t("div",{class:"num faint",style:"font-size:12.5px",children:["worst case ~",i.worstSolPerDay.toFixed(2)," SOL/day \\xB7 ",y(i.perTrade,1,!0)," per trade (worst ",y(i.worstPerTrade,1,!0),") \\xB7 ",i.unseenTrades," unseen trades \\xB7 ~",i.tradesPerDay.toFixed(0)," trades/day your limits allow"]})]},i.text))]}),e.log.length>0&&t("details",{class:"more",children:[t("summary",{children:["Decisions (",e.log.length,")"]}),t("p",{class:"faint",style:"font-size:12.5px;margin:0 0 6px",children:["One click puts a rule back in use.",n?" The autopilot stays on: it keeps your pick unless a proven rule does clearly better.":""," The numbers in a decision are what was known then."]}),e.log.map(i=>t("div",{class:"edge",children:[t("div",{class:"faint",style:"font-size:12px",children:new Date(i.at).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}),t("div",{style:"font-size:13px",children:i.what}),i.rules.map((l,d)=>t("div",{class:"row wrap",style:"gap:6px;margin-top:4px",children:[i.rules.length>1&&t("span",{class:"faint",style:"font-size:12.5px;flex:1;min-width:0",children:l.text}),t(hn,{r:l,id:`log:${i.at}:${d}`,use:o,busy:r,confirmRule:a})]},d))]},i.at+i.what))]})]})}var gn={ok:"good",info:void 0,warn:"warn",fail:"bad"},xo={ok:"\\u2713",info:"i",warn:"!",fail:"\\u2715"};function bn(){let[e,n]=b(void 0),[o,r]=b(""),[a,s]=b(!1),i=async()=>{s(!0);try{let c=await k("/api/diagnosis");try{await navigator.clipboard.writeText(c.text),r(""),S("Copied. Paste it into your chat with Claude.")}catch{r(c.text)}}catch(c){S(String(c.message))}finally{s(!1)}};if(A(()=>{let c=()=>k("/api/checks").then(g=>n(g.view)).catch(()=>n(null));c();let u=setInterval(c,6e4);return()=>clearInterval(u)},[]),!e)return null;let l={fail:0,warn:1,info:2,ok:3},d=[...e.checks].sort((c,u)=>l[c.status]-l[u.status]),p=d[0]?.status??"ok";return t("div",{class:"card",style:"margin-top:12px",children:[t("div",{class:"row",style:"align-items:flex-start",children:[t("div",{style:"flex:1",children:[t("h2",{style:"margin-bottom:2px",children:"Self-check"}),t("div",{class:"muted",style:"font-size:13px",children:"The bot watching itself: do its recordings match its real trades, does the rule in use keep its promise, are its decisions steady, does it see what it records. Anything that turns bad is sent to Telegram at once, and once a day a check-up."})]}),t(x,{tone:gn[p],children:e.checks.length?e.summary.replace(/^\\S+\\s/,""):"not run yet"})]}),d.map(c=>t("div",{class:"edge",children:t("div",{class:"row",style:"gap:8px;align-items:flex-start",children:[t(x,{tone:gn[c.status],children:xo[c.status]}),t("div",{style:"flex:1;min-width:0",children:[t("b",{style:"font-size:13.5px",children:c.title}),t("div",{class:"faint",style:"font-size:12.5px",children:c.detail})]})]})},c.key)),e.at>0&&t("p",{class:"faint note",children:["Checked ",Q(e.at)," \\xB7 every 10 minutes, and in full every 2 hours. Telegram: /checks"]}),t("div",{class:"row wrap",style:"gap:8px;margin-top:8px",children:[t("button",{class:"btn sm",disabled:a,onClick:i,children:a?"Preparing\\u2026":"Copy a diagnosis for Claude"}),t("span",{class:"faint",style:"font-size:12.5px",children:"Everything the bot sees in one page \\u2014 its data, the search\'s closest tries, how your rule does \\u2014 to paste into a chat. No keys or wallet in it."})]}),o&&t("textarea",{class:"inp wide",readOnly:!0,rows:10,value:o,onFocus:c=>c.target.select(),"aria-label":"diagnosis"})]})}var Z=null;function vn(){let e=P(h=>h.settings),n=P(h=>h.funnelHour),o=P(h=>h.funnelDay),r=P(h=>h.health),a=P(h=>h.account),[s,i]=b(Z?.draft??e),[l,d]=b(Z!==null),[p,c]=b(!1),[u,g]=b(!1);if(A(()=>{if(!e)return;if(!Z){i(e);return}let h=nn(Z.draft,Z.base,e);Z={draft:h,base:e},i(h)},[e]),A(()=>{if(!l)return;let h=H=>{H.preventDefault(),H.returnValue=""};return window.addEventListener("beforeunload",h),()=>window.removeEventListener("beforeunload",h)},[l]),!s||!e)return null;let f=h=>{Z={draft:h,base:Z?.base??e},i(h),d(!0)},m=(h,H)=>f({...s,[h]:H}),_=(h,H)=>f({...s,filters:{...s.filters,[h]:H}}),v=()=>{Z=null,i(e),d(!1)},w=async h=>{c(!0);try{let H=h??ut(s,Z?.base??e),Y=await k("/api/settings",H);h||(Z=null,i(Y.settings),d(!1));let I=e.autopilot&&Y.settings.autopilot&&ct(e,Y.settings)?" \\xB7 The autopilot stays on: it keeps your rule unless a proven rule does clearly better":"";S(`${h?"Updated":"Saved \\u2014 applies to new trades"}${I}`),q()}catch(H){S(String(H.message))}finally{c(!1)}},T=!!r?.live&&!r.live.halted,U=o?.scored??0,W=o?.coinsAbove?.[Math.round(s.minScore)]??0,G=U>0?W/U:NaN,z=Math.max(1/6,Math.min(o?.hours??1,(r?.uptimeSec??3600)/3600)),C=U>0?W/z:NaN;return t("div",{children:[t("div",{class:`bigswitch ${e.enabled?"on":""}`,children:[t(re,{id:"enabled",checked:e.enabled,label:"Auto-trading",onChange:h=>w({enabled:h})}),t("div",{style:"flex:1",children:[t("div",{style:"font-weight:760;font-size:16px",children:e.enabled?"Auto-trading is ON":"Auto-trading is paused"}),t("div",{class:"muted",style:"font-size:13px",children:e.enabled?`${Le(e)}${e.scoreOnly?" \\xB7 score only":" \\xB7 with filters"} \\xB7 ${e.mode==="live"?"LIVE money":"paper"} \\xB7 ${N.demo?"demo: runs while this page is open (the real bot runs on a server 24/7)":"runs on the server even with this page closed"}`:"The radar keeps scoring; no new trades. Open positions are still managed."})]}),t(x,{tone:e.mode==="live"?"bad":"flare",children:e.mode==="live"?"LIVE":"PAPER"})]}),t(fn,{settings:e}),t(bn,{}),t(_o,{settings:e,onApplied:()=>void q()}),t("div",{class:"grid two",style:"margin-top:12px",children:[t("div",{class:"card",children:[t("h2",{children:"Entry"}),t(ko,{draft:s,saved:e,edit:f}),s.entryAt==="score"&&t(M,{children:[t(E,{label:`Minimum score: ${s.minScore}`,htmlFor:"minScore",help:t(M,{children:[Number.isFinite(G)?t(M,{children:["Recently ",t("b",{children:C.toFixed(1)})," coins/hour reached this (",(G*100).toFixed(1),"% of scored coins) \\u2014 that is roughly how many chances to buy you get."]}):"Collecting data on how often coins reach each score\\u2026"," ","50 is a typical coin moment and 75 the top 5% (the score keeps that meaning when it learns): higher means better odds."]}),children:t("span",{})}),t("input",{id:"minScore",type:"range",min:0,max:100,step:1,value:s.minScore,onInput:h=>m("minScore",Number(h.target.value)),style:"width:100%","aria-label":"minimum score"})]}),t("div",{class:"field",style:s.scoreOnly?"background:var(--flare-soft);border-radius:10px;padding:12px;margin:8px 0;border:0":"",children:[t("div",{class:"row",children:[t("label",{for:"scoreOnly",style:"flex:1;font-weight:700",children:s.entryAt==="score"?"Score only":"No filters"}),t(re,{id:"scoreOnly",checked:s.scoreOnly,label:s.entryAt==="score"?"Score only":"No filters",onChange:h=>m("scoreOnly",h)})]}),t("div",{class:"help",children:[s.entryAt==="score"?"When on, the bot buys on the score alone and ignores every filter below.":"When on, the bot buys every coin at this moment and ignores every filter below."," Your budget limits still apply (size, max open positions, daily loss, one entry per coin) \\u2014 they protect the wallet, they don\'t judge the coin."]})]}),t(E,{label:"Take profit",htmlFor:"tp",help:"Net of all fees and slippage. 100 = sell at 2\\xD7.",children:t(R,{id:"tp",value:s.tpPct,onChange:h=>m("tpPct",h),min:1,suffix:"%"})}),t(E,{label:"Stop loss",htmlFor:"sl",help:"From your entry cost, fixed (not trailing). In a crash the fill can land below this \\u2014 the bot always sells.",children:t(R,{id:"sl",value:s.slPct,onChange:h=>m("slPct",h),min:1,max:99,suffix:"%"})}),t(E,{label:"Sell after",htmlFor:"hold",help:"Time limit for each trade: sells at market if neither the target nor the stop was hit by then. 0 = no limit. The recordings keep 5, 10, 30, 60 and 120 min and 6 h (360), so a rule with one of these can be weighed on them.",children:t(R,{id:"hold",value:s.maxHoldMin,onChange:h=>m("maxHoldMin",h),min:0,suffix:"min"})}),t(E,{label:"Size per trade",htmlFor:"size",help:e.mode==="live"&&r?.live?`Server cap: ${r.live.maxPositionSol} SOL per live trade.`:"Fees included.",children:t(R,{id:"size",value:s.positionSol,onChange:h=>m("positionSol",h),step:.01,min:.001,suffix:"SOL"})}),t(E,{label:"Max open positions",htmlFor:"maxOpen",children:t(R,{id:"maxOpen",value:s.maxOpen,onChange:h=>m("maxOpen",h),min:1,max:50})}),t(E,{label:"Trade stage",help:"Bonding curve = before graduation (fast, cheap entry). Graduated = PumpSwap after migration.",children:t("div",{class:"chips",children:[t("button",{class:"chip","aria-pressed":s.tradeCurve,onClick:()=>m("tradeCurve",!s.tradeCurve),children:"Curve"}),t("button",{class:"chip","aria-pressed":s.tradeAmm,onClick:()=>m("tradeAmm",!s.tradeAmm),children:"Graduated"})]})}),t("div",{class:"row",style:"margin-top:12px;gap:8px",children:[t("button",{class:"btn primary",disabled:!l||p,onClick:()=>w(),children:p?"Saving\\u2026":l?"Save settings":"Saved"}),l&&t("button",{class:"btn ghost",onClick:v,children:"Discard"})]}),e.autopilot&&t(To,{draft:s}),t("p",{class:"faint",style:"font-size:12px;margin:10px 0 0",children:"Open positions keep the exit settings they were bought with."})]}),t(So,{funnel:n,threshold:e.minScore,scoreOnly:e.scoreOnly,enabled:e.enabled,open:a?.open.length??0,maxOpen:e.maxOpen})]}),t("div",{class:"card",style:"margin-top:12px",children:[t("h2",{children:["Filters ",s.scoreOnly&&t(x,{tone:"flare",children:"ignored \\u2014 score only is on"})]}),t("fieldset",{disabled:s.scoreOnly,style:"border:0;padding:0;margin:0;opacity:1",children:t("div",{style:s.scoreOnly?"opacity:.45":"",children:[t(E,{label:"Max dev holding",htmlFor:"fDev",children:t(R,{id:"fDev",value:s.filters.maxDevPct,onChange:h=>_("maxDevPct",h),suffix:"%"})}),t(E,{label:"Max top-10 holders",htmlFor:"fTop",children:t(R,{id:"fTop",value:s.filters.maxTop10Pct,onChange:h=>_("maxTop10Pct",h),suffix:"%"})}),t(E,{label:"Max launch bundle",htmlFor:"fBundle",help:"Supply bought by other wallets in the launch block.",children:t(R,{id:"fBundle",value:s.filters.maxBundlePct,onChange:h=>_("maxBundlePct",h),suffix:"%"})}),t(E,{label:"Min distinct buyers",htmlFor:"fBuyers",children:t(R,{id:"fBuyers",value:s.filters.minBuyers,onChange:h=>_("minBuyers",h)})}),t(E,{label:"Market cap window",help:"SOL, 0 = no limit",children:t("span",{class:"row",style:"gap:6px",children:[t(R,{id:"fMin",value:s.filters.minMcapSol,onChange:h=>_("minMcapSol",h)}),t("span",{class:"faint",children:"to"}),t(R,{id:"fMax",value:s.filters.maxMcapSol,onChange:h=>_("maxMcapSol",h)})]})}),t(E,{label:"Skip serial launchers",htmlFor:"fSerial",help:"Devs with more than this many launches in 24h (0 = off).",children:t(R,{id:"fSerial",value:s.filters.maxDevLaunches24h,onChange:h=>_("maxDevLaunches24h",h)})}),t(E,{label:"Skip if dev sold more than",htmlFor:"fDevSold",help:"100 = off",children:t(R,{id:"fDevSold",value:s.filters.maxDevSoldPct,onChange:h=>_("maxDevSoldPct",h),suffix:"%"})}),t(E,{label:"Require socials",htmlFor:"fSocial",children:t(re,{id:"fSocial",checked:s.filters.requireSocials,label:"Require socials",onChange:h=>_("requireSocials",h)})})]})}),t("details",{class:"more",children:[t("summary",{children:"Advanced execution"}),t(E,{label:"Entry slippage",htmlFor:"slip",help:"How far the price may move before your buy lands. Too tight = missed entries on fast coins; the bot retries while the score holds.",children:t(R,{id:"slip",value:s.slippagePct,onChange:h=>m("slippagePct",h),suffix:"%"})}),t(E,{label:"Keep retrying a missed entry for",htmlFor:"retry",children:t(R,{id:"retry",value:s.retryWindowSec,onChange:h=>m("retryWindowSec",h),suffix:"s"})}),t(E,{label:"Score must hold for",htmlFor:"confirm",help:"Evaluations in a row at or above your score before buying \\u2014 about one per second while the coin trades. 5 skips one-off spikes and costs a few seconds; 1 buys on the first.",children:t(R,{id:"confirm",value:s.confirmTicks,onChange:h=>m("confirmTicks",h),min:1,max:20})}),t(E,{label:"Exit slippage (starts at)",htmlFor:"xslip",help:"Escalates automatically on retries \\u2014 exits always go through.",children:t(R,{id:"xslip",value:s.exitSlippagePct,onChange:h=>m("exitSlippagePct",h),suffix:"%"})}),t(E,{label:"Sell a coin that went quiet after",htmlFor:"stale",help:"No trades for this long frees the slot (0 = never).",children:t(R,{id:"stale",value:s.staleExitMin,onChange:h=>m("staleExitMin",h),suffix:"min"})}),t(E,{label:"Trailing stop after target",htmlFor:"trail",help:"When TP is reached, keep riding and sell if the value drops this much from its peak (0 = sell at TP).",children:t(R,{id:"trail",value:s.trailPct,onChange:h=>m("trailPct",h),suffix:"%"})}),t(E,{label:"Take initials at target",htmlFor:"initials",help:"At TP sell just enough to get your stake back; the rest rides with the trailing stop (40% if none set).",children:t(re,{id:"initials",checked:s.takeInitials,label:"Take initials",onChange:h=>m("takeInitials",h)})}),t(E,{label:"Priority fee",htmlFor:"prio",children:t(R,{id:"prio",value:s.priorityFeeSol,onChange:h=>m("priorityFeeSol",h),step:1e-4,suffix:"SOL"})}),t(E,{label:"Daily loss limit",htmlFor:"dll",help:"Stops new entries for the rest of the UTC day (0 = off).",children:t(R,{id:"dll",value:s.maxDailyLossSol,onChange:h=>m("maxDailyLossSol",h),step:.05,suffix:"SOL"})}),t(E,{label:"Max trades per hour",htmlFor:"tph",children:t(R,{id:"tph",value:s.maxTradesPerHour,onChange:h=>m("maxTradesPerHour",h)})}),t(E,{label:"Buy the same coin again",htmlFor:"reentry",help:"Off: each coin gets one entry moment \\u2014 the first time it reaches your score. On: it can be bought again after dipping and coming back, which in simulation lost about 40% per trade.",children:t(re,{id:"reentry",checked:s.reentry,label:"Re-entry",onChange:h=>m("reentry",h)})}),t(E,{label:"Auto-tune (paper only)",htmlFor:"autotune",help:"After each learning run, switch score/TP/SL to the combination with the best proven results (95% worst case must beat the current one). Never touches live settings, and rests while the autopilot is on (it picks the whole rule).",children:t(re,{id:"autotune",checked:s.autoTune,label:"Auto-tune",onChange:h=>m("autoTune",h)})}),t(E,{label:"Paper delay",htmlFor:"lat",help:"Simulated time from decision to landing on-chain. Honest paper results need a realistic delay.",children:t(R,{id:"lat",value:s.paperLatencyMs,onChange:h=>m("paperLatencyMs",h),step:100,suffix:"ms"})})]})]}),t("div",{class:"grid two",style:"margin-top:12px",children:[t("div",{class:"card",children:[t("h2",{children:"Mode"}),t("div",{class:"chips",children:[t("button",{class:"chip","aria-pressed":e.mode==="paper",onClick:()=>w({mode:"paper"}),children:"Paper"}),t("button",{class:"chip","aria-pressed":e.mode==="live",disabled:!T,onClick:()=>w({mode:"live"}),children:"Live"})]}),t("p",{class:"muted",style:"font-size:13px",children:T?`Live wallet ${r?.live?.address?.slice(0,4)}\\u2026${r?.live?.address?.slice(-4)} \\xB7 balance ${r?.live?.balanceSol?.toFixed(3)??"?"} SOL \\xB7 cap ${r?.live?.maxPositionSol} SOL/trade.`:r?.live?.halted?`Live trading halted: ${r.live.halted}.`:"Live is locked. It unlocks only when the server owner sets LIVE_TRADING and a dedicated wallet \\u2014 see Setup."}),T&&e.autopilot&&t("p",{class:"faint",style:"font-size:12.5px",children:"Autopilot is on: with real money it trades only a rule proven at the real-money bar (100+ unseen trades, worst case above +2% per trade). Until one exists, new live entries wait."}),r?.live?.halted&&t("button",{class:"btn sm",onClick:()=>k("/api/live/resume",{}).then(()=>S("Live resumed")),children:"Resume live"})]}),t("div",{class:"card",children:[t("h2",{children:"Emergency"}),u?t("div",{class:"row wrap",children:[t("b",{children:"Sell everything now?"}),t("button",{class:"btn danger",onClick:async()=>{await k("/api/kill",{on:!0,sellAll:!0}),g(!1),S("Kill switch ON \\u2014 selling"),q()},children:"Yes, sell all"}),t("button",{class:"btn",onClick:()=>g(!1),children:"Cancel"})]}):t("div",{class:"row wrap",children:[t("button",{class:"btn danger",onClick:()=>g(!0),children:"Kill switch"}),t("span",{class:"muted",style:"font-size:13px",children:"Stops all new entries and sells every open position."})]}),a?.killed&&t("button",{class:"btn sm",style:"margin-top:8px",onClick:()=>k("/api/kill",{on:!1}).then(()=>q()),children:"Turn kill switch off"})]})]}),l&&t("div",{class:"savebar",role:"status",children:[t("span",{style:"flex:1",children:"Not saved yet \\u2014 the bot still trades on the saved settings."}),t("button",{class:"btn sm ghost",onClick:v,children:"Discard"}),t("button",{class:"btn sm primary",disabled:p,onClick:()=>w(),children:p?"Saving\\u2026":"Save"})]})]})}function So({funnel:e,threshold:n,scoreOnly:o,enabled:r,open:a,maxOpen:s}){if(!e)return t("div",{class:"card",children:"Loading\\u2026"});let i=r?e.scored===0?"No coins scored yet \\u2014 check that the data feeds are green (More \\u2192 Health).":e.maxScore<n?`No coin reached ${n} this hour (best was ${Math.round(e.maxScore)}). Lower the score to trade more often.`:e.signals===0?`Coins reached ${n}, but none crossed it since the bot was switched on or the threshold changed.`:a>=s?`All ${s} position slots are in use.`:e.entered>0?"Trading normally.":"Signals were blocked \\u2014 see the reasons below.":"Auto-trading is paused.";return t("div",{class:"card",children:[t("h2",{children:"Why no trade? \\xB7 last hour"}),t("p",{style:"margin:0 0 10px;font-weight:650",children:i}),t("div",{class:"stats",style:"grid-template-columns:repeat(4,1fr)",children:[t("div",{class:"stat",children:[t("div",{class:"k",children:"Coins scored"}),t("div",{class:"v num",children:e.scored})]}),t("div",{class:"stat",children:[t("div",{class:"k",children:["Reached ",n]}),t("div",{class:"v num",children:e.coinsAbove?.[Math.round(n)]??e.signals})]}),t("div",{class:"stat",children:[t("div",{class:"k",children:"Bought"}),t("div",{class:"v num good",children:e.entered})]}),t("div",{class:"stat",children:[t("div",{class:"k",children:"Missed"}),t("div",{class:"v num warn",children:e.failed})]})]}),t("div",{style:"margin:12px 0 4px",class:"faint",children:["Best score of each coin this hour (highest ",Math.round(e.maxScore),"):"]}),t(Qt,{bins:e.hist,threshold:n}),e.reasons.length>0&&t("div",{style:"margin-top:12px",children:[t("div",{class:"faint",style:"margin-bottom:6px",children:["Blocked because\\u2026 ",o&&t(x,{tone:"flare",children:"score only: filters skipped"})]}),t("table",{children:t("tbody",{children:e.reasons.slice(0,8).map(l=>t("tr",{children:[t("td",{children:l.text}),t("td",{class:"r num",children:l.n})]},l.reason))})})]})]})}function _o({settings:e,onApplied:n}){let[o,r]=b(null),[a,s]=b(null),[i,l]=b(null);A(()=>{k("/api/edges").then(g=>r(g.report)).catch(()=>{})},[]);let d=mn(o),p=e.mode==="live",c=async g=>{if(p&&a!==g.key){s(g.key);return}l(g.key);try{await k("/api/settings",g.settings);let f=e.autopilot?" The autopilot stays on: it keeps this rule unless a proven rule does clearly better.":"";S(e.enabled?`Now trading: ${g.name}.${f}`:`Strategy set: ${g.name}. Switch Auto-trading on to start.${f}`),s(null),n()}catch(f){S(String(f.message))}finally{l(null)}},u=!d.some(g=>Ke(e,g.settings));return t("div",{class:"card",style:"margin-top:12px",children:[t("h2",{children:"Strategy"}),t("p",{class:"faint",style:"margin:0 0 4px;font-size:12.5px",children:["One tap sets the whole rule \\u2014 entry score, which coins, take profit, stop loss and time limit. Fine-tune it below afterwards.",e.autopilot&&" The autopilot stays on when you pick one here or change the rule below: your rule then competes with the proven ones, and stays unless one does clearly better."]}),u&&t("div",{class:"strat active",children:t("div",{style:"flex:1;min-width:0",children:[t("div",{class:"row wrap",style:"gap:6px",children:[t("b",{children:"Custom"}),t(x,{tone:"flare",children:"active"})]}),t("div",{class:"num",style:"font-size:13px",children:[Le(e)," \\xB7 ",e.scoreOnly?"score only":"with filters"]})]})}),d.map(g=>{let f=Ke(e,g.settings);return t("div",{class:`strat ${f?"active":""}`,children:[t("div",{style:"flex:1;min-width:0",children:[t("div",{class:"row wrap",style:"gap:6px",children:[t("b",{children:g.name}),g.proof==="unproven"&&t(x,{tone:"warn",children:"unproven"}),g.proof==="data"&&t(x,{tone:"good",children:"held up on unseen data"}),f&&t(x,{tone:"flare",children:"active"})]}),t("div",{class:"num",style:"font-size:13px",children:Le(g.settings)}),t("div",{class:"faint",style:"font-size:12.5px",children:g.note})]}),!f&&t("button",{class:`btn sm ${a===g.key?"danger":"primary"}`,disabled:!!i,onClick:()=>c(g),children:i===g.key?"\\u2026":a===g.key?"Tap again \\u2014 real money":"Use this"})]},g.key)}),p&&t("p",{class:"faint note",children:"You are live: switching asks for a second tap. Open positions keep the rule they were bought with."})]})}var yn={age:["age20","age45","age90","age180","age360","age720"],mig:["mig60","mig300","mig900","mig3600"],prog:["prog25","prog50","prog75"]};function ko({draft:e,saved:n,edit:o}){let r=e.entryAt,a=r==="score"?"score":r.startsWith("age")?"age":r.startsWith("mig")?"mig":"prog",s=d=>o({...e,entryAt:d,...d.startsWith("mig")?{tradeAmm:!0}:d==="score"?{}:{tradeCurve:!0}}),i=Ve(r);return t("div",{class:"field",children:[t("div",{style:"font-weight:700;margin-bottom:6px",children:"Buy"}),t("div",{class:"chips",children:[["score","When the score reaches","score"],["age","After launch","age180"],["mig","After graduating","mig300"],["prog","On the way to graduation","prog50"]].map(([d,p,c])=>t("button",{class:"chip","aria-pressed":a===d,onClick:()=>a!==d&&s(c),children:p},d))}),(a==="age"||a==="mig")&&t("div",{class:"row wrap",style:"gap:6px;margin-top:8px",children:[t(Mo,{kind:a,sec:Number(r.slice(3)),onChange:d=>s(en(a,d))}),yn[a].map(d=>t("button",{class:"chip","aria-pressed":r===d,onClick:()=>s(d),children:te(d).replace(/ after .*/,"")},d))]}),a==="prog"&&t("div",{class:"chips",style:"margin-top:8px",children:yn.prog.map(d=>t("button",{class:"chip","aria-pressed":r===d,onClick:()=>s(d),children:te(d).replace(" to graduation","")},d))}),t("div",{class:"help",children:a==="score"?"Buys a coin the first time its score reaches your minimum and holds it.":t(M,{children:["Buys every coin ",t("b",{children:te(r)}),a==="mig"?" (graduated coins)":" (still on the bonding curve)"," \\u2014 the score is not used."," ",i?n.moments.includes(r)?"A moment of your own: the bot records it for every coin since you added it, so rules at it are measured and searched like the fixed ones.":"A moment of your own: once saved, the bot records it for every coin, so rules at it can be measured and searched after about a day of recordings.":"The bot records this moment for every coin, so the autopilot can weigh a rule at it right away."]})}),e.moments.length>0&&t("div",{class:"help row wrap",style:"gap:6px",children:[t("span",{children:"Moments of your own recorded for every coin:"}),e.moments.map(d=>t("span",{class:"row",style:"gap:2px",children:[t(x,{children:te(d)}),d!==r&&t("button",{class:"btn sm ghost","aria-label":`stop recording ${te(d)}`,title:"Stop recording it",onClick:()=>o({...e,moments:e.moments.filter(p=>p!==d)}),children:"\\xD7"})]},d))]})]})}function Mo({kind:e,sec:n,onChange:o}){let r=d=>String(+(d/60).toFixed(2)),[a,s]=b(r(n)),[i,l]=b(!1);return A(()=>{i||s(r(n))},[n,i]),t("span",{class:"row",style:"gap:6px",children:[t("input",{class:"inp",style:"width:84px",type:"text",inputMode:"decimal",value:a,"aria-label":e==="age"?"minutes after launch":"minutes after graduating",onFocus:()=>l(!0),onBlur:()=>l(!1),onInput:d=>{let p=d.target.value;s(p);let c=Number(p.replace(",","."));Number.isFinite(c)&&c>0&&o(Math.round(c*60))}}),t("span",{class:"muted",children:"min"})]})}function To({draft:e}){let n=ln(e,216e5);return t("p",{class:"faint",style:"font-size:12.5px;margin:10px 0 0",children:n?`The autopilot cannot weigh this rule on the recordings: ${n}. Until it has 30 trades of its own, any proven rule replaces it \\u2014 pick recorded values to let it compete.`:"The autopilot can weigh this rule on the recordings, with the same bar as the proven rules: it stays unless one does clearly better."})}var wn=36e5,xn={freshMs:6*wn,better:1.25,liveMinTrades:100,liveMinLo:.02,maxPlacebo:.2,checkAfter:30,forwardMin:40,trackMin:30,benchMs:24*wn};function Sn(){let[e,n]=b(null),[o,r]=b(""),[a,s]=b(!1),[i,l]=b(""),d=()=>k("/api/lab").then(u=>n(u.view)).catch(()=>{});if(A(()=>{d();let u=setInterval(d,6e4);return()=>clearInterval(u)},[]),!e)return null;let p=async()=>{if(o.trim()){s(!0);try{let u=await k("/api/lab/idea",{text:o});S(u.note),r(""),d()}catch(u){S(String(u.message))}finally{s(!1)}}},c=async()=>{try{let u=await k("/api/lab/summary");try{await navigator.clipboard.writeText(u.text),l(""),S("Copied. Paste it into a chat with Claude, then paste the rules it suggests back here, one at a time.")}catch{l(u.text)}}catch(u){S(String(u.message))}};return t("div",{class:"card",style:"margin-top:12px",children:[t("h2",{style:"margin-bottom:4px",children:"Lab"}),t("div",{class:"muted",style:"font-size:13px",children:["Invents rules the edge finder cannot try \\u2014 one or two conditions on any of the ",Pe.length," facts the bot records about a coin (money flowing in, smart wallets, holders, narrative and market heat\\u2026) \\u2014 and proves each one only on coins that came after it was invented. An idea is judged at ",$e.looks.join(", ")," coins; one without an edge passes by luck at most about once in ",Math.round(1/($e.alpha*$e.looks.length)),". Proven ideas go to the autopilot like any proven rule."]}),t("p",{class:"edge-meta",children:e.note}),e.proven.map(u=>t(mt,{i:u},u.id)),e.testing.map(u=>t(mt,{i:u},u.id)),!e.proven.length&&!e.testing.length&&t("p",{class:"faint note",children:"No ideas being tested yet."}),e.retired.length>0&&t("details",{class:"more",children:[t("summary",{children:["Did not hold up (",e.retired.length,")"]}),e.retired.map(u=>t(mt,{i:u},u.id))]}),t("div",{style:"margin-top:12px",children:[t("b",{style:"font-size:13.5px",children:"Test your own idea"}),t("div",{class:"row",style:"gap:8px;margin-top:6px",children:[t("input",{class:"inp wide",placeholder:"mig300 top10<=25% smart>=1 tp100 sl30 hold30",value:o,onInput:u=>r(u.target.value),onKeyDown:u=>u.key==="Enter"&&void p(),"aria-label":"rule to test"}),t("button",{class:"btn sm primary",disabled:a||!o.trim(),onClick:p,children:"Test it"})]}),t("p",{class:"faint note",children:["Your ideas: ",e.slots.mine," of ",e.slots.mineMax," at a time."]}),t("details",{class:"more",children:[t("summary",{children:"How to write a rule"}),t("p",{class:"faint note",children:e.format})]}),t("button",{class:"btn sm",onClick:c,children:"Copy a summary for Claude"}),t("p",{class:"faint note",children:"Free with the Claude plan you already have: paste the summary into a chat, ask for new rules, and test the ones you like here. They are judged like any other \\u2014 only on coins after you add them."}),i&&t("textarea",{class:"inp wide",readOnly:!0,rows:8,value:i,onFocus:u=>u.target.select(),"aria-label":"summary for Claude"})]})]})}function mt({i:e}){let n=e.status==="proven"?"good":e.status==="retired"?"bad":void 0;return t("div",{class:"edge",children:[t("div",{class:"row",style:"gap:8px;align-items:flex-start",children:[t("div",{class:"edge-rule",style:"flex:1",children:e.text}),t(x,{tone:n,children:e.status==="proven"?"proven":e.status==="retired"?"retired":e.source==="you"?"yours \\xB7 testing":"testing"})]}),t("div",{class:"num",style:"font-size:13px",children:e.n?t(M,{children:[t("b",{class:e.mean>0?"good":"bad",children:y(e.mean,1,!0)})," per trade on ",e.n," coins after it \\xB7 95% range ",y(e.lo,1,!0)," to ",y(e.hi,1,!0),e.coinsPerDay!==null&&` \\xB7 ~${e.coinsPerDay.toFixed(0)} coins/day`]}):t("span",{class:"faint",children:"Waiting for coins that come after it (each finishes about 6 hours after entry)."})}),e.status==="testing"&&e.nextLook&&t("div",{class:"faint num",style:"font-size:12.5px",children:["Next judged at ",e.nextLook," coins."]}),e.status==="proven"&&e.proof&&t("div",{class:"faint num",style:"font-size:12.5px",children:["Proven on ",e.proof.n," coins: worst case ",y(e.proof.lo,1,!0)," per trade",e.post&&e.post.n>0?` \\xB7 since then ${y(e.post.mean,1,!0)} on ${e.post.n}`:"","."]}),e.why&&t("div",{class:"faint",style:"font-size:12.5px",children:e.why}),e.seen&&t("div",{class:"faint num",style:"font-size:12px",children:["When invented, on past data: ",y(e.seen.mean,1,!0)," per trade on ",e.seen.n," (not proof)."]}),t("div",{class:"faint",style:"font-size:12px;font-family:var(--mono, monospace)",children:e.code})]})}var Ge={curve:"Bonding curve",amm:"Graduated"};function $o(e,n){return e==="trees"?`weighted sum + ${n??0} trees`:e==="linear"?"weighted sum":"starting assumptions"}function _n(){let[e,n]=b(null),[o,r]=b(""),[a,s]=b(!1),[i,l]=b("curve"),d=()=>k("/api/learning").then(v=>{n(v.view),r("")}).catch(v=>r(String(v.message??v)));A(()=>{d();let v=setInterval(d,6e4);return()=>clearInterval(v)},[]);let p=async()=>{s(!0);try{let v=await k("/api/learn/run",{});S(v.reports.some(w=>w.adopted)?"The bot switched to a better score":"Current score kept \\u2014 see the history below"),await d()}catch(v){S(String(v.message))}finally{s(!1)}};if(!e)return t("div",{class:"card",style:"margin-top:12px",children:[t("h2",{children:"What the bot learned"}),t("p",{class:"faint note",children:o||"Loading\\u2026"})]});let c=e.model,u=c.source==="trained",g=(c.rows.curve?.total??0)+(c.rows.amm?.total??0),f=(c.rows.curve?.entries??0)+(c.rows.amm?.entries??0),m=["curve","amm"].filter(v=>e.drivers[v]?.length),_=e.drivers[i]?.length?i:m[0]??"curve";return t("div",{class:"card",style:"margin-top:12px",children:[t("div",{class:"row",style:"align-items:flex-start",children:[t("div",{style:"flex:1",children:[t("h2",{style:"margin-bottom:4px",children:"What the bot learned"}),t("div",{class:"learn-head",children:u?t(M,{children:["Score retrained ",Q(c.createdAt)," on its own outcomes",g>0&&t(M,{children:[" ","\\u2014 ",se(g)," moments, ",se(f)," of them the moment a coin first reached a score (when the bot buys)"]}),"."]}):t(M,{children:["Still on its starting assumptions."," ",e.status.everyHours>0?`It learns once enough outcomes have finished: first try 20 min after start, then every ${e.status.everyHours} h.`:"It learns when you tap Retrain now, once enough outcomes have finished (the server does this by itself every few hours)."]})})]}),t("button",{class:"btn sm",disabled:a||e.status.running,onClick:p,children:a||e.status.running?"Learning\\u2026":"Retrain now"})]}),t("div",{class:"chips",style:"margin-top:10px",children:["curve","amm"].map(v=>t(x,{tone:c.recipe[v]==="trees"?"good":c.recipe[v]==="linear"?"flare":void 0,children:[Ge[v],": ",$o(c.recipe[v],c.trees[v])]},v))}),t("p",{class:"faint note",children:["The score is a weighted sum of ",be.length," signals; with enough data, small decision trees are added on top to learn combinations a sum cannot (say, heavy buying ",t("i",{children:"but"})," the dev already sold). A new score replaces the current one only if it predicts newer coins \\u2014 that neither of them has seen \\u2014 better. After every retrain, 50 is still a typical coin moment and 75 the top 5%, so your minimum score picks about the same share of coins \\u2014 better ones as the ranking improves."]}),t("h3",{class:"learn-sub",children:"Is the score still working?"}),e.fresh.map(v=>t(Po,{f:v},v.stage)),m.length>0&&t(M,{children:[t("div",{class:"row",style:"margin-top:14px;align-items:center",children:[t("h3",{class:"learn-sub",style:"flex:1;margin:0",children:"What moves the score now"}),m.length>1&&t("div",{class:"chips",children:m.map(v=>t("button",{class:"chip","aria-pressed":_===v,onClick:()=>l(v),children:Ge[v]},v))})]}),t(Lo,{list:e.drivers[_]??[]}),t("p",{class:"faint note",children:["Measured on the last ",se(e.driverCoins[_]??0),` coins. \\u2191 more of it raises the score \\xB7 \\u2193 lowers it \\xB7 \\u2195 depends on the other signals. Bars: share of the score\'s movement; "at start" is the share the starting assumptions gave it.`]})]}),t(Fo,{runs:e.history,status:e.status})]})}function Po({f:e}){let n=Ge[e.stage];if(e.verdict==="not_enough")return t("div",{class:"fresh",children:[t("div",{children:[t("b",{children:n})," ",t("span",{class:"faint",children:"\\xB7 checking"})]}),t("div",{class:"faint",style:"font-size:12.5px",children:[se(e.n)," finished outcomes of coins this score has not seen (",se(e.wins)," wins). The check needs 150 with 10 wins; each outcome is followed until it resolves (up to 6 h)."]})]});let o=e.verdict==="working"?"good":e.verdict==="slipping"?"warn":"bad",r=e.verdict==="working"?"working":e.verdict==="slipping"?"weaker":"not working",a=e.bands.filter(s=>s.n>0);return t("div",{class:"fresh",children:[t("div",{class:"row",style:"gap:8px",children:[t("b",{children:n}),t(x,{tone:o,children:r})]}),t("div",{style:"font-size:13px",children:["On ",t("b",{class:"num",children:se(e.n)})," coins it had not seen, the score ranked a winner above a loser ",t("b",{class:"num",children:y(e.auc)})," of the time",Number.isFinite(e.expected)?` (${y(e.expected)} when it was adopted)`:"","; 50% would be a coin toss. The top fifth by score won ",y(e.topWinRate),", all of them"," ",y(e.winRate),"."]}),a.length>1&&t("details",{class:"more",children:[t("summary",{children:"Promised vs. delivered, by score"}),t("div",{class:"tablewrap",children:t("table",{children:[t("thead",{children:t("tr",{children:[t("th",{children:"Score"}),t("th",{class:"r",children:"Moments"}),t("th",{class:"r",children:"Win chance it gave"}),t("th",{class:"r",children:"Actually won"})]})}),t("tbody",{children:a.map(s=>t("tr",{children:[t("td",{class:"num",children:[s.lo,"\\u2013",s.hi]}),t("td",{class:"r num",children:se(s.n)}),t("td",{class:"r num",children:y(s.predicted,1)}),t("td",{class:`r num ${s.n>=30&&Math.abs(s.actual-s.predicted)>.1?"warn":""}`,children:y(s.actual,1)})]},s.lo))})]})})]})]})}function Lo({list:e}){let n=Math.max(.01,...e.map(o=>o.share));return t("div",{class:"drivers",children:e.map(o=>{let r=o.dir==="up"?"\\u2191":o.dir==="down"?"\\u2193":"\\u2195",a=o.priorShare!==void 0&&Math.abs(o.share-o.priorShare)>=.04;return t("div",{class:"driver",children:[t("span",{class:`arrow ${o.dir==="up"?"good":o.dir==="down"?"bad":"muted"}`,"aria-label":o.dir,children:r}),t("span",{children:o.label}),t("span",{class:"num faint",children:y(o.share)}),t("div",{class:"bar",children:t("i",{style:{width:`${Math.round(o.share/n*100)}%`}})}),a&&t("span",{class:"was faint",children:[o.share>o.priorShare?"learned it matters more":"learned it matters less"," \\xB7 at start ",y(o.priorShare)]})]},o.key)})})}var Ao={schedule:"scheduled",manual:"by hand",drift:"score weakened",start:"after start"};function Fo({runs:e,status:n}){let o=Math.max(1,Math.round((n.nextRun-Date.now())/6e4)),r=n.nextRun>Date.now()?` \\xB7 next run in ${o>=120?`${Math.round(o/60)} h`:`${o} min`}`:"";return t("details",{class:"more",style:"margin-top:14px",children:[t("summary",{children:["Learning history (",e.length,")",r]}),n.lastError&&t("p",{class:"bad note",children:["Last run failed: ",n.lastError]}),!e.length&&t("p",{class:"faint note",children:"No learning run yet."}),[...e].reverse().map(a=>t("div",{class:"edge",children:[t("div",{class:"row",style:"gap:8px",children:[t("b",{children:new Date(a.at).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}),t(x,{tone:a.adopted?"good":void 0,children:a.adopted?"switched to a better score":"kept the score"}),t("span",{class:"faint",style:"font-size:12px",children:[Ao[a.trigger]??a.trigger," \\xB7 ",se(a.rows)," moments \\xB7 ",(a.ms/1e3).toFixed(1)," s"]})]}),a.stages.map(s=>t("div",{class:"faint",style:"font-size:12.5px",children:[Ge[s.stage],": ",s.reason,s.fresh>0&&Number.isFinite(s.after.auc)&&t(M,{children:[" ","\\xB7 ranking on unseen coins ",y(s.before.auc)," \\u2192 ",y(s.after.auc)]})]},s.stage))]},a.at))]})}function Tn(){let e=P(l=>l.settings),[n,o]=b(null),[r,a]=b(""),s=()=>k("/api/learn?days=14").then(o).catch(l=>a(String(l.message??l)));if(A(()=>{s();let l=setInterval(s,6e4);return()=>clearInterval(l)},[e?.minScore,e?.tpPct,e?.slPct]),r)return t(D,{children:r});if(!n)return t(D,{children:"Loading evidence\\u2026"});let i=Math.max(.05,...n.grid.filter(l=>l.n>0).map(l=>Math.abs(l.avgRet)));return t("div",{children:[t("div",{class:"section-title",children:[t("h2",{children:"Does the score make money?"}),t("span",{class:"muted num",children:[n.samples.toLocaleString()," resolved outcomes \\xB7 ",n.spanHours.toFixed(1)," h of data"]})]}),t("div",{class:`card ${n.gate.pass,""}`,style:`border-color:${n.gate.pass?"var(--good)":"var(--line)"}`,children:[t("div",{class:"row",style:"align-items:flex-start",children:[t("div",{style:"flex:1",children:[t("div",{class:"faint",style:"font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:700",children:["Go-live check \\xB7 score \\u2265 ",n.settings.minScore,", TP ",n.settings.tpPct,"%, SL ",n.settings.slPct,"%"]}),t("div",{style:"font-size:19px;font-weight:780;margin:4px 0",children:n.gate.verdict}),t("div",{class:"muted",children:n.gate.detail})]}),t(x,{tone:n.gate.pass?"good":"warn",children:n.gate.pass?"evidence \\u2713":"paper first"})]}),t("p",{class:"faint",style:"font-size:12.5px;margin:10px 0 0",children:["Every eligible coin is followed from fixed checkpoints and at every signal, as if bought with your size and delay, until the target or the stop is hit. Break-even win rate at these settings \\u2248 ",t("b",{children:y(n.breakEven)})," (fees, delay and stop slippage included)."]})]}),t(_n,{}),t(Eo,{mode:e?.mode??"paper",autopilot:!!e?.autopilot}),t(Sn,{}),n.suggestion&&!e?.autopilot&&t("div",{class:"card",style:"margin-top:12px;border-color:var(--flare)",children:[t("h2",{children:"Better settings found"}),t("p",{style:"margin:0 0 10px",children:[t("b",{children:["Score \\u2265 ",n.suggestion.minScore," \\xB7 TP ",n.suggestion.tpPct,"% \\xB7 SL ",n.suggestion.slPct,"%"]})," ","\\u2014 ",n.suggestion.why,"."]}),t("div",{class:"row wrap",children:[t("button",{class:"btn primary",onClick:async()=>{try{await k("/api/settings",{minScore:n.suggestion.minScore,tpPct:n.suggestion.tpPct,slPct:n.suggestion.slPct}),S("Applied \\u2014 new trades use these settings"),s()}catch(l){S(String(l.message))}},children:"Apply"}),t("span",{class:"faint",style:"font-size:12.5px",children:"Past results can stop working. The autopilot (Bot tab) switches rules by itself, only on proof from data the search never saw; auto-tune does this in paper mode (Bot \\u2192 Advanced)."})]})]}),t("div",{class:"grid two",style:"margin-top:12px",children:[t("div",{class:"card",children:[t("h2",{children:"Score buckets \\u2192 outcome"}),n.checkpoints===0?t(D,{children:"Outcomes resolve as coins hit their targets or stops \\u2014 first rows appear within minutes, solid numbers take a few days."}):t("div",{class:"tablewrap",children:t("table",{children:[t("thead",{children:t("tr",{children:[t("th",{children:"Score"}),t("th",{class:"r",children:"n"}),t("th",{class:"r",children:"Profitable"}),t("th",{class:"r",children:"Avg result"}),t("th",{class:"r",children:"95% range"})]})}),t("tbody",{children:[...n.buckets].reverse().map(l=>t("tr",{style:l.lo>=(e?.minScore??75)-9&&l.lo<=90&&l.lo+10>(e?.minScore??75)?"background:var(--flare-soft)":"",children:[t("td",{class:"num",children:[l.lo,"\\u2013",l.hi]}),t("td",{class:"r num",children:l.n}),t("td",{class:"r num",children:l.n?y(l.winRate):"\\u2014"}),t("td",{class:`r num ${l.avgRet>0?"good":l.avgRet<0?"bad":""}`,children:l.n?y(l.avgRet,1,!0):"\\u2014"}),t("td",{class:"r num faint",children:l.n>1?`${y(l.retLo,0,!0)} \\u2026 ${y(l.retHi,0,!0)}`:"\\u2014"})]},l.lo))})]})})]}),t("div",{class:"card",children:[t("h2",{children:"Pick a threshold"}),t("p",{class:"faint",style:"margin:0 0 8px;font-size:12.5px",children:n.thresholdSource==="entries"?"What happened after coins first reached each score \\u2014 the moment the bot buys \\u2014 with your TP/SL, delay and costs.":"For now: snapshots of coins above each score. Buying the moment a coin reaches a score usually does worse; this switches to real entry outcomes after 200 of them."}),t("div",{class:"tablewrap",children:t("table",{children:[t("thead",{children:t("tr",{children:[t("th",{children:"Score \\u2265"}),t("th",{class:"r",children:"Coins/hour"}),t("th",{class:"r",children:"Profitable"}),t("th",{class:"r",children:"Avg result"})]})}),t("tbody",{children:n.thresholds.map(l=>t("tr",{style:l.min===e?.minScore?"background:var(--flare-soft)":"",children:[t("td",{class:"num",children:l.min}),t("td",{class:"r num",children:Number.isFinite(l.tokensPerHour)?l.tokensPerHour.toFixed(1):"\\u2014"}),t("td",{class:"r num",children:l.n?y(l.winRate):"\\u2014"}),t("td",{class:`r num ${l.avgRet>0?"good":l.avgRet<0?"bad":""}`,children:l.n?y(l.avgRet,1,!0):"\\u2014"})]},l.min))})]})})]})]}),t("div",{class:"card",style:"margin-top:12px",children:[t("h2",{children:["Take profit \\xD7 stop loss \\xB7 coins scoring \\u2265 ",n.settings.minScore]}),t("p",{class:"faint",style:"margin:0 0 8px;font-size:12.5px",children:["Average result per trade for each exit combination, delay and costs included, from"," ",n.gridSource==="signals"?"your own signals":n.gridSource==="entries"?"coins at the moment they first reached your score":"snapshots of coins above your score (until entry data builds up)",". Darker green = better; cells with fewer than 30 outcomes are faded."]}),t("div",{class:"tablewrap",children:t("table",{class:"heat",children:[t("thead",{children:t("tr",{children:[t("th",{children:"TP \\\\ SL"}),[...new Set(n.grid.map(l=>l.sl))].map(l=>t("th",{style:"text-align:center",children:["\\u2212",l,"%"]},l))]})}),t("tbody",{children:[...new Set(n.grid.map(l=>l.tp))].map(l=>t("tr",{children:[t("th",{children:["+",l,"%"]}),n.grid.filter(d=>d.tp===l).map(d=>{let p=Number.isFinite(d.avgRet)?Math.min(1,Math.abs(d.avgRet)/i):0,c=d.avgRet>=0?`color-mix(in srgb,var(--good) ${Math.round(p*45)}%,transparent)`:`color-mix(in srgb,var(--bad) ${Math.round(p*45)}%,transparent)`,u=d.tp===e?.tpPct&&d.sl===e?.slPct;return t("td",{style:{background:d.n?c:"transparent",opacity:d.n<30?.45:1,outline:u?"2px solid var(--flare)":"none"},title:`n=${d.n}, 95% ${y(d.retLo,1)} \\u2026 ${y(d.retHi,1)}`,children:d.n?y(d.avgRet,1,!0):"\\u2014"},d.sl)})]},l))})]})}),n.best&&t("p",{style:"margin:10px 0 0",children:["Most robust so far: ",t("b",{children:["TP ",n.best.tp,"% / SL ",n.best.sl,"%"]})," \\u2014 average ",y(n.best.avgRet,1,!0),", worst-case (95%) ",y(n.best.retLo,1,!0)," over ",n.best.n," outcomes."]})]}),t("div",{class:"card",style:"margin-top:12px",children:[t("h2",{children:"Your paper results"}),t("dl",{class:"kv",children:[t("dt",{children:"Closed trades"}),t("dd",{children:n.paper.trades}),t("dt",{children:"Win rate"}),t("dd",{children:y(n.paper.winRate)}),t("dt",{children:"Profit"}),t("dd",{class:n.paper.pnlSol>=0?"good":"bad",children:[n.paper.pnlSol.toFixed(3)," SOL"]}),t("dt",{children:"Average trade"}),t("dd",{children:Number.isFinite(n.paper.avgPct)?`${n.paper.avgPct.toFixed(1)}%`:"\\u2014"}),t("dt",{children:"Profit factor"}),t("dd",{children:Number.isFinite(n.paper.profitFactor)?n.paper.profitFactor.toFixed(2):"\\u2014"}),t("dt",{children:"Worst drawdown"}),t("dd",{children:[n.paper.maxDrawdownSol.toFixed(3)," SOL"]})]})]})]})}var kn=e=>e>=48?`${(e/24).toFixed(1)} days`:`${e.toFixed(0)} h`;function Eo({mode:e,autopilot:n}){let[o,r]=b(null),[a,s]=b(!1);A(()=>{k("/api/edges").then(c=>r(c.report)).catch(()=>{})},[]);let i=async()=>{s(!0);try{r((await k("/api/edges/run",{})).report)}catch(c){S(String(c.message))}finally{s(!1)}},[l,d]=b(null),p=async c=>{if(e==="live"&&l!==c.text){d(c.text);return}try{await k("/api/settings",c.settings),d(null),S(`Now trading this rule \\u2014 score, exits, time limit and filters were replaced${n?". The autopilot stays on: it keeps this rule unless a proven rule does clearly better":""}`)}catch(u){S(String(u.message))}};return t("div",{class:"card",style:"margin-top:12px",children:[t("div",{class:"row",style:"align-items:flex-start",children:[t("div",{style:"flex:1",children:[t("h2",{style:"margin-bottom:4px",children:"Edge finder"}),t("div",{class:"muted",style:"font-size:13px",children:["Looks for profitable rules on its own: ",de.length+Object.keys(ie).length," kinds of entry (",de.length," score levels, and"," ",Object.keys(ie).length," fixed points in a coin\'s life such as halfway to graduation) \\xD7 ",an.length," coin conditions \\xD7 ",K.length*pe.length," exits (take profit ",_e[0],"\\u2013",_e[_e.length-1],"%, stop ",ke[0],"\\u2013",ke[ke.length-1],"%, optional time limit). The best are re-checked on newer data the search never saw."]})]}),t("button",{class:"btn sm",disabled:a||o?.running,onClick:i,children:a||o?.running?"Searching\\u2026":"Search now"})]}),!o&&t("p",{class:"faint note",children:"Runs every 2 hours (Telegram: /edges). Needs about a day of recorded market first."}),o?.status==="not_enough_data"&&t("p",{class:"faint note",children:o.note}),o?.status==="ok"&&t(M,{children:[t("p",{class:"edge-meta",children:["Scored ",t("b",{class:"num",children:o.tested.toLocaleString("en-US")})," rules on the first ",kn(o.discoveryHours),", re-checked the best ",o.candidates," on the last"," ",kn(o.holdoutHours),": ",t("b",{children:[o.survivors.length," held up"]}),\'. On shuffled data, where no rule can work, the same search "found" \',o.placebo.avgSurvivors.toFixed(1)," per run \\u2014 that is its rate of fooling itself."]}),o.survivors.slice(0,5).map(c=>t(Mn,{s:c,confirming:l===c.text,apply:p},c.text)),o.survivors.length>5&&t("details",{class:"more",children:[t("summary",{children:[o.survivors.length-5," more variations"]}),o.survivors.slice(5).map(c=>t(Mn,{s:c,confirming:l===c.text,apply:p},c.text))]}),o.survivors.length>0&&t("p",{class:"faint note",children:"Coins/day counts every coin that qualified; your size, open-position and hourly limits decide how many the bot actually takes."}),o.survivors.length>0&&n&&t("p",{class:"note",children:o.placebo.avgSurvivors<=xn.maxPlacebo?"Autopilot is on: the bot trades the best of these by itself (Bot tab). Picking one here makes it your rule, and the autopilot stays on: a proven rule replaces it only when clearly better.":"Autopilot is on but does not use these: on shuffled data the same search found rules too, so they may be luck."}),!o.survivors.length&&t("p",{class:"note",children:o.note}),o.failed.length>0&&t("details",{class:"more",children:[t("summary",{children:["Looked good, then failed on newer data (",o.failed.length,")"]}),o.failed.map(c=>t("div",{class:"edge",children:[t("div",{children:c.text}),t("div",{class:"faint num",style:"font-size:12.5px",children:[y(c.discovery.mean,1,!0)," in the search data \\u2192 ",y(c.holdout.mean,1,!0)," on the newest data (",c.holdout.n," trades)"]})]},c.text))]})]})]})}function Mn({s:e,confirming:n,apply:o}){return t("div",{class:"edge",children:[t("div",{class:"edge-rule",children:e.text}),t("div",{class:"num",style:"font-size:13px",children:[t("b",{class:e.holdout.mean>0?"good":"bad",children:y(e.holdout.mean,1,!0)})," per trade on the newest data \\xB7 worst case ",y(e.holdout.lo,1,!0)," \\xB7 ",e.holdout.n," ","trades \\xB7 ",y(e.holdout.winRate)," winners \\xB7 ~",e.tradesPerDay.toFixed(0)," coins/day"]}),t("div",{class:"faint num",style:"font-size:12.5px",children:["In the search data ",y(e.discovery.mean,1,!0)," \\xB7 every coin reaching ",e.level,", same exit: ",y(e.baseline,1,!0)]}),t("button",{class:`btn sm ${n?"danger":"primary"}`,style:"justify-self:start;margin-top:4px",onClick:()=>o(e),children:n?"Tap again \\u2014 real money":"Use this rule"})]})}var Ye={bot_off:"Auto-trading is paused",kill_switch:"Kill switch is on",autopilot_hold:"Autopilot: no rule is proven enough for real money yet \\u2014 new live entries wait (open positions are still managed)",stage_off:"This stage is turned off in settings",non_sol_quote:"Coin is not paired with SOL",already_traded:"Already traded this coin (re-entry off)",max_open:"Max open positions reached",pending:"An order for this coin is already in flight",daily_loss_limit:"Daily loss limit reached",rate_limit:"Max trades per hour reached",feed_down:"Live data feed is down \\u2014 not trading blind",warming_up:"Learning this market\'s score scale (first minutes after install)",insufficient_balance:"Not enough SOL \\u2014 paper: Trades tab \\u2192 Add paper SOL; live: fund the wallet",slippage:"Price moved more than your slippage before the buy landed",migrating:"Coin is migrating to PumpSwap (not tradable for a moment)",rule_conditions:"Does not meet the conditions of the rule in use",not_followed:"Its price is not followed right now (more graduated coins than the bot can follow at once) \\u2014 not buying at an old price",no_price:"No tradable price yet",no_liquidity:"Not enough liquidity",size_too_small:"Position size too small after fees",live_error:"Live order error",live_disabled:"Live trading is not enabled on the server","filter:mcap_min":"Market cap below your minimum","filter:mcap_max":"Market cap above your maximum","filter:dev":"Dev holds more than your limit","filter:top10":"Top 10 holders above your limit","filter:bundle":"Launch bundle above your limit","filter:buyers":"Fewer buyers than your minimum","filter:age_min":"Coin younger than your minimum age","filter:age_max":"Coin older than your maximum age","filter:socials":"No socials (you require them)","filter:serial_dev":"Dev launched too many coins today","filter:dev_sold":"Dev already sold more than your limit"};function Ro(e){let n=Math.round((Date.now()-e)/6e4);return n<1?"just now":n<60?`${n} min ago`:`${Math.round(n/60)} h ago`}var ht=20,Co=1e6/30;function $n(e,n){try{navigator.clipboard.writeText(e).then(()=>S(`${n} copied`),()=>S("Select the text and copy it"))}catch{S("Select the text and copy it")}}function Ae({n:e,title:n,done:o,children:r}){return t("div",{class:`card step ${o?"done":""}`,children:[t("div",{class:"row",style:"gap:10px;margin-bottom:8px",children:[t("span",{class:"stepno",children:o?"\\u2713":e}),t("b",{style:"flex:1;font-size:15px",children:n}),o&&t(x,{tone:"good",children:"done"})]}),r]})}function Pn(){let e=P(L=>L.settings),[n,o]=b(null),[r,a]=b(!1),[s,i]=b(""),[l,d]=b(""),[p,c]=b(""),[u,g]=b(""),[f,m]=b(""),[_,v]=b("0.05"),[w,T]=b("0.25"),[U,W]=b(""),G=()=>k("/api/setup").then(L=>{o(L),a(!1)}).catch(()=>{});if(A(()=>{if(N.demo)return;G();let L=setInterval(G,4e3);return()=>clearInterval(L)},[]),N.demo)return t("div",{class:"card",children:[t("h2",{children:"Setup"}),t("p",{style:"margin-top:0",children:"On your own bot this page sets everything up with buttons \\u2014 no files to edit: the market-data key, Telegram alerts, a link for your phone, and going live with a wallet when you decide to."}),t("button",{class:"btn primary",onClick:()=>ue("more","deploy"),children:"How to install the real bot"})]});if(!n)return t("div",{class:"empty",children:"Loading\\u2026"});let z=async(L,In,Bn,Hn)=>{i(L);try{let me=await k(In,Bn);Hn(me),me.restarting?a(!0):me.note&&S(me.note),G()}catch(me){S(String(me.message))}finally{i("")}},C=n.stream.feed,h=C?.status==="open",H=C?.mbPerDay?C.mbPerDay*ht:null,Y=Number(p||n.stream.budgetMb),I=L=>Math.round(L).toLocaleString("en-US"),$=n.update,gt=s==="update",bt=$&&t("div",{class:`card step ${$.available?"hot":$.can&&$.checkedAt?"done":""}`,children:[t("div",{class:"row",style:"gap:10px;margin-bottom:8px",children:[t("span",{class:"stepno",children:$.available?"\\u2191":$.can&&$.checkedAt?"\\u2713":"\\u21BB"}),t("b",{style:"flex:1;font-size:15px",children:$.available?"A new version of SIGNAL is ready":$.can&&$.checkedAt?"SIGNAL is up to date":"Updates"}),$.current&&t("span",{class:"faint num",title:"this bot\'s version",children:["v ",$.current.slice(0,7)]})]}),$.available&&$.can&&t(M,{children:[t("p",{class:"muted",style:"margin:0 0 8px",children:"One tap: the bot downloads it, restarts by itself in about a minute, and keeps your keys, settings, history and open trades."}),t("button",{class:"btn primary",disabled:!!s,onClick:()=>z("update","/api/setup/update",{},L=>L.version&&S(`Installed ${String(L.version).slice(0,7)} \\u2014 restarting`)),children:gt?$.state==="installing"?"Installing\\u2026":"Downloading\\u2026":"Update now"})]}),$.available&&!$.can&&t("p",{class:"muted",style:"margin:0",children:$.why}),!$.available&&t("div",{class:"row wrap",style:"gap:8px",children:[t("span",{class:"faint",style:"flex:1",children:$.can?$.checkedAt?`Checked ${Ro($.checkedAt)} \\xB7 checks by itself every few hours.`:"Checks by itself every few hours.":$.why}),$.can&&t("button",{class:"btn sm ghost",disabled:!!s,onClick:()=>z("check","/api/setup/update-check",{},L=>S(L.update?.available?"A new version is ready":L.update?.checkedAt?"Up to date":"Could not reach GitHub \\u2014 try later")),children:s==="check"?"Checking\\u2026":"Check now"})]}),$.state==="failed"&&$.error&&!gt&&t("p",{class:"note",style:"color:var(--bad);margin-bottom:0",children:["Last try: ",$.error]})]});return t("div",{class:"grid setup",children:[r&&t("div",{class:"banner sim",style:"margin:0;width:100%",children:"Restarting the bot to apply it \\u2014 this page reconnects by itself in a few seconds."}),$?.available&&bt,t(Ae,{n:1,title:"Market data",done:h,children:[t("p",{class:"muted",style:"margin-top:0",children:["Every pump.fun trade comes from the ",t("b",{children:"free public Solana feed"})," \\u2014 no key, no account, no cost. Coins that graduate to PumpSwap are followed one by one while they matter (the ones you hold, and fresh graduates for an hour)."]}),t("p",{class:"faint note",style:"margin-top:0",children:["Now:"," ",C?`${n.stream.source==="rpc"?"through your key":"free public feed"} (${C.host}) \\xB7 ${C.status}, ${C.msgs.toLocaleString("en-US")} messages`:"not connected",C&&(C.netMbPerDay??C.mbPerDay)!==null&&` \\xB7 about ${I(C.netMbPerDay??C.mbPerDay)} MB a day of internet`,C?.budget&&` \\xB7 today ${I(C.budget.usedMb)} of ${I(C.budget.limitMb)} MB through your key${C.budget.onFree?" \\u2014 cap reached, on the free feed until 00:00 UTC":""}`]}),t("b",{style:"display:block;margin:10px 0 4px",children:"Your RPC key (optional)"}),t("p",{class:"muted",style:"margin:0 0 8px",children:["Needed only to send orders when you go live. A free Helius key is enough: sign up at"," ",t("a",{href:"https://dashboard.helius.dev",target:"_blank",rel:"noopener",children:"dashboard.helius.dev"}),", open ",t("b",{children:"API Keys"}),", copy the key and paste it here. ",n.rpc.isPublic?"No key saved yet.":`Key saved (${n.rpc.host}).`]}),t("div",{class:"row wrap",style:"gap:8px",children:[t("input",{class:"inp wide",type:"password",autoComplete:"off",placeholder:"Helius API key",value:l,onInput:L=>d(L.target.value)}),t("button",{class:"btn",disabled:!l||!!s,onClick:()=>z("rpc","/api/setup/rpc",{key:l},()=>d("")),children:s==="rpc"?"Testing\\u2026":"Save key"})]}),!n.rpc.isPublic&&t(M,{children:[t("b",{style:"display:block;margin:14px 0 4px",children:"Stream trades through your key instead?"}),t("p",{class:"muted",style:"margin:0 0 8px",children:["Only if the free feed keeps dropping. Keys are billed by data: Helius charges about ",ht," credits per MB, and its free plan has about"," ",I(Co)," credits a day.",H!==null&&` The stream measured now is about ${I(C.mbPerDay)} MB a day \\u2014 about ${I(H)} credits a day through a key.`," With a daily cap the key carries the stream until the cap, then the free feed takes over until 00:00 UTC."]}),t("div",{class:"row wrap",style:"gap:8px;align-items:center",children:[t("div",{class:"chips",children:[t("button",{class:"chip","aria-pressed":n.stream.chosen==="public",disabled:!!s,onClick:()=>z("stream","/api/setup/stream",{source:"public",budgetMb:Y},()=>{}),children:"Free public feed"}),t("button",{class:"chip","aria-pressed":n.stream.chosen==="rpc",disabled:!!s,onClick:()=>z("stream","/api/setup/stream",{source:"rpc",budgetMb:Y},()=>{}),children:"Through my key"})]}),t("label",{class:"row",style:"gap:6px",children:["at most",t("input",{class:"inp",style:"max-width:90px",inputMode:"numeric",value:p||String(n.stream.budgetMb),onInput:L=>c(L.target.value)}),"MB a day \\u2248 ",I(Y*ht)," credits"]})]})]})]}),t(Ae,{n:2,title:"Telegram alerts (optional)",done:n.telegram.linked,children:[n.telegram.linked?t("p",{class:"muted",style:"margin:0",children:"Linked. You get a message for every buy and sell, and can send /status, /pause, /resume, /score 75, /tp 100, /sl 50, /hold 10, /kill."}):n.telegram.code?t("p",{style:"margin:0",children:["Now open your new bot in Telegram and send it this code: ",t("b",{class:"num linkcode",children:n.telegram.code}),t("span",{class:"faint",children:" \\u2014 this page turns green when it arrives."})]}):t(M,{children:[t("ol",{class:"steps",style:"margin:0 0 8px",children:[t("li",{children:["In Telegram, open ",t("b",{children:"@BotFather"})," and send ",t("code",{children:"/newbot"}),"."]}),t("li",{children:\'Pick any name, then a username ending in "bot".\'}),t("li",{children:"Copy the token it gives you (looks like 123456789:AAH\\u2026) and paste it here."})]}),t("div",{class:"row wrap",style:"gap:8px",children:[t("input",{class:"inp wide",type:"password",autoComplete:"off",placeholder:"Bot token from @BotFather",value:u,onInput:L=>g(L.target.value)}),t("button",{class:"btn primary",disabled:!u||!!s,onClick:()=>z("tg","/api/setup/telegram",{token:u},()=>g("")),children:s==="tg"?"Checking\\u2026":"Connect"})]})]}),n.telegram.tokenSet&&t("button",{class:"btn sm ghost",style:"margin-top:6px",onClick:()=>z("tgoff","/api/setup/telegram-off",{},()=>S("Telegram disconnected")),children:"Disconnect Telegram"})]}),t(Ae,{n:3,title:"Paper trading",done:!!e?.enabled&&e.mode==="paper",children:[t("p",{class:"muted",style:"margin:0 0 8px",children:["Fake money on the real market. Bot tab \\u2192 pick a ",t("b",{children:"Strategy"})," \\u2192 switch ",t("b",{children:"Auto-trading"})," on. Leave it running for days; the Learn tab tells you when the evidence is strong enough to go live."]}),t("button",{class:"btn",onClick:()=>ue("bot"),children:"Open the Bot tab"})]}),t(Ae,{n:4,title:"Your phone",done:!!n.anywhereUrl,children:[t("p",{class:"muted",style:"margin:0 0 8px",children:"Telegram works anywhere with nothing more to set up: /status, /strategy, /score 75, /pause, /update\\u2026 For the full dashboard on your phone:"}),n.anywhereUrl?t(M,{children:[t("b",{style:"display:block;margin-bottom:4px",children:"Anywhere (Tailscale)"}),t("div",{class:"copyline",children:[t("code",{children:n.anywhereUrl}),t("button",{class:"btn sm",onClick:()=>$n(n.anywhereUrl,"Link"),children:"Copy"})]}),t("p",{class:"faint note",children:"Open it on your phone and add it to your home screen. Telegram\'s /link sends it to you too."})]}):t("ol",{class:"steps",style:"margin:0 0 8px",children:[t("li",{children:["Install"," ",t("a",{href:"https://tailscale.com/download",target:"_blank",rel:"noopener",children:"Tailscale"})," ","(free) on this computer and sign in (Google works)."]}),t("li",{children:"Install the Tailscale app on your phone and sign in with the same account."}),t("li",{children:"A link that works anywhere appears here in a minute \\u2014 and Telegram\'s /link sends it to your phone."})]}),n.phoneUrl&&t(M,{children:[t("b",{style:"display:block;margin:10px 0 4px",children:"At home (same Wi-Fi)"}),t("div",{class:"copyline",children:[t("code",{children:n.phoneUrl}),t("button",{class:"btn sm",onClick:()=>$n(n.phoneUrl,"Link"),children:"Copy"})]})]})]}),t(Ae,{n:5,title:"Go live with real money \\u2014 only when ready",done:n.live.enabled&&n.live.ready,children:[n.live.enabled?t(M,{children:[t("p",{style:"margin:0 0 6px",children:["Live trading is allowed with wallet"," ",t("code",{children:[n.live.address?.slice(0,4),"\\u2026",n.live.address?.slice(-4)]})," ","\\xB7 max ",n.live.maxPositionSol," SOL per trade \\xB7 stops for the day after losing ",n.live.maxDailyLossSol," SOL."," ",n.live.ready?"Switch Bot tab \\u2192 Mode \\u2192 Live to start.":"The wallet is not ready yet (check More \\u2192 Health)."]}),t("div",{class:"row wrap",style:"gap:8px",children:[t("button",{class:"btn",onClick:()=>ue("bot"),children:"Open the Bot tab"}),t("button",{class:"btn danger",disabled:!!s,onClick:()=>z("off","/api/setup/live-off",{},()=>S("Live trading off \\u2014 back to paper")),children:"Turn live off"})]})]}):n.privateChannel?t(M,{children:[n.rpc.isPublic&&t("p",{class:"note warn",style:"margin-top:0",children:"Save your free Helius key in step 1 first: orders are sent through it (the public endpoint is slow for sending)."}),t("ol",{class:"steps",style:"margin:0 0 10px",children:[t("li",{children:"In Phantom, create a new account used only by the bot, and send it the SOL you can afford to lose."}),t("li",{children:"Phantom \\u2192 Settings \\u2192 Manage accounts \\u2192 that account \\u2192 Show private key. Copy it."}),t("li",{children:"Paste it below. It stays on this computer and is never shown again."})]}),t("div",{class:"grid",style:"gap:8px",children:[t("input",{class:"inp wide",type:"password",autoComplete:"off",placeholder:n.live.walletSet?"Wallet saved \\u2014 paste only to replace it":"Bot wallet private key",value:f,onInput:L=>m(L.target.value)}),t("label",{class:"row",style:"gap:8px",children:[t("span",{style:"flex:1",children:"Max SOL per trade"}),t("input",{class:"inp",inputMode:"decimal",value:_,onInput:L=>v(L.target.value)})]}),t("label",{class:"row",style:"gap:8px",children:[t("span",{style:"flex:1",children:"Stop for the day after losing (SOL)"}),t("input",{class:"inp",inputMode:"decimal",value:w,onInput:L=>T(L.target.value)})]}),t("input",{class:"inp wide",autoComplete:"off",placeholder:\'Type "I understand the risk"\',value:U,onInput:L=>W(L.target.value)}),t("button",{class:"btn danger",disabled:!f&&!n.live.walletSet||!U||!!s,onClick:()=>z("live","/api/setup/live",{walletKey:f,maxPositionSol:Number(_),maxDailyLossSol:Number(w),confirm:U},L=>{m(""),W(""),S(`Live allowed for wallet ${String(L.address).slice(0,4)}\\u2026${String(L.address).slice(-4)}`)}),children:"Allow live trading"})]}),t("p",{class:"faint note",children:"After the restart, switch Bot tab \\u2192 Mode \\u2192 Live. The limits above cannot be raised from the Bot tab."})]}):t("p",{class:"muted",style:"margin:0",children:"For safety, a wallet can only be added on the computer running the bot \\u2014 open http://localhost:8787 there."}),n.live.walletSet&&n.privateChannel&&t("button",{class:"btn sm ghost",style:"margin-top:6px",onClick:()=>z("rm","/api/setup/wallet-remove",{},()=>S("Wallet removed from this bot")),children:"Remove the wallet from this bot"})]}),!$?.available&&bt,!n.supervised&&t("p",{class:"faint note",children:"This bot was started without its starter script, so after saving you will need to close it and start it again. Use start-windows.bat (or start-mac.command) so this happens by itself."})]})}var Oo=[["signals","Signals log"],["narratives","Narratives"],["wallets","Smart wallets"],["health","Health"],["setup","Setup"]];function Ln({open:e}){let n=P(s=>s.nav),[o,r]=b(n?.tab==="more"&&n.sub?n.sub:N.moreTabs[0]?.key??"signals");A(()=>{n?.tab==="more"&&n.sub&&r(n.sub)},[n?.at]);let a=N.moreTabs.find(s=>s.key===o);return t("div",{children:[t("div",{class:"chips",style:"margin:14px 0",children:[...N.moreTabs.map(s=>[s.key,s.label]),...Oo].map(([s,i])=>t("button",{class:"chip","aria-pressed":o===s,onClick:()=>r(s),children:i},s))}),a&&a.render(),o==="signals"&&t(No,{open:e}),o==="narratives"&&t(Do,{open:e}),o==="wallets"&&t(Io,{}),o==="health"&&t(Bo,{}),o==="setup"&&t(M,{children:[t(Pn,{}),t(Ho,{})]})]})}function No({open:e}){let n=P(r=>r.signals),o=P(r=>r.solUsd);return n.length?t("div",{class:"card flat",style:"padding:4px 8px",children:t("div",{class:"tablewrap",children:t("table",{children:[t("thead",{children:t("tr",{children:[t("th",{children:"Time"}),t("th",{children:"Coin"}),t("th",{class:"r",children:"Score"}),t("th",{class:"r",children:"Mcap"}),t("th",{children:"Decision"})]})}),t("tbody",{children:n.map(r=>t("tr",{style:"cursor:pointer",onClick:()=>e(r.mint),children:[t("td",{class:"faint num",children:fe(r.ts)}),t("td",{children:t("b",{children:["$",r.symbol||"?"]})}),t("td",{class:"r num",children:Math.round(r.score)}),t("td",{class:"r num",children:ee(r.mcapSol,o)}),t("td",{style:"white-space:normal",children:[t(x,{tone:r.decision==="entered"?"good":r.decision==="blocked"?void 0:r.decision==="failed"?"warn":"flare",children:r.decision})," ",t("span",{class:"faint",children:r.reason?Ye[r.reason]??r.reason:""})]})]},r.id))})]})})}):t(D,{children:"Every time a coin crosses your score it is logged here with what the bot did about it."})}function Do({open:e}){let[n,o]=b(null),r=P(a=>a.solUsd);return A(()=>{let a=()=>k("/api/narratives").then(i=>o(i.clusters)).catch(()=>o([]));a();let s=setInterval(a,15e3);return()=>clearInterval(s)},[]),n?n.length?t("div",{class:"list",children:[t("p",{class:"muted",style:"margin:0 0 4px",children:"Same idea, many coins: attention coordinates on one. Leaders (biggest market cap) tend to keep the flow; copies usually fade."}),n.map(a=>t("button",{class:"coin",onClick:()=>a.leader&&e(a.leader),children:[t("div",{class:"score b2",style:"font-size:15px",children:[a.size,t("small",{children:"COINS"})]}),t("div",{class:"body",children:[t("div",{class:"title",children:t("span",{class:"sym",children:a.key.replace(/^(t|w|tw|x):/,s=>({"t:":"$","w:":"","tw:":"tweet ","x:":"@"})[s]??"")})}),t("div",{class:"meta",children:[t("span",{children:["leader ",t("b",{children:["$",a.leaderSymbol??"?"]})," ",a.leaderName?`\\xB7 ${a.leaderName}`:""]}),t("span",{children:ee(a.leaderMcap,r)}),a.leaderScore!==void 0&&t("span",{children:["score ",Math.round(a.leaderScore)]}),t("span",{children:["first ",Q(a.firstTs)]})]})]})]},a.key))]}):t(D,{children:"No narrative clusters in the last hour yet. When several coins launch around the same name, ticker or tweet, they group here \\u2014 and the market usually picks one winner."}):t(D,{children:"Loading\\u2026"})}function Io(){let[e,n]=b(null);return A(()=>{k("/api/wallets").then(n).catch(()=>n({wallets:[]}))},[]),e?t("div",{class:"card flat",children:[t("h3",{children:"Learned from the order flow"}),t("p",{class:"muted",style:"margin-top:0",children:[e.tracked?.toLocaleString()," wallets tracked \\xB7 ",t("b",{children:e.smart})," currently qualify as smart (\\u22658 closed coins, high win rate and ROI, not serial devs). They are a score input, never a copy-trade rule."]}),e.wallets.length===0?t(D,{children:"Needs a few hours of data before wallets have enough closed trades to judge."}):t("div",{class:"tablewrap",children:t("table",{children:[t("thead",{children:t("tr",{children:[t("th",{children:"Wallet"}),t("th",{class:"r",children:"Coins"}),t("th",{class:"r",children:"Win"}),t("th",{class:"r",children:"Avg ROI"}),t("th",{class:"r",children:"Profit"}),t("th",{children:"Tags"})]})}),t("tbody",{children:e.wallets.map(o=>t("tr",{children:[t("td",{class:"mono",children:N.demo?t("span",{class:"mono",children:ce(o.address)}):t("a",{href:`https://solscan.io/account/${o.address}`,target:"_blank",rel:"noopener",children:ce(o.address)})}),t("td",{class:"r num",children:o.closed}),t("td",{class:"r num",children:y(o.winRate)}),t("td",{class:"r num",children:y(o.avgRoi)}),t("td",{class:`r num ${o.pnl>=0?"good":"bad"}`,children:[o.pnl.toFixed(2)," SOL"]}),t("td",{children:o.tags.map(r=>t(x,{tone:r==="smart"?"good":r==="serial-dev"||r==="bundler"?"bad":void 0,children:r},r))})]},o.address))})]})})]}):t(D,{children:"Loading\\u2026"})}function Bo(){let e=P(i=>i.health),n=P(i=>i.connected),[o,r]=b([]);if(A(()=>{k("/api/logs").then(i=>r(i.lines)).catch(()=>{})},[]),!e)return t(D,{children:"Loading\\u2026"});let a=Date.now(),s=e.feeds.some(i=>i.critical&&i.status==="open");return t("div",{class:"grid",children:[!s&&t("div",{class:"banner bad",style:"margin:0",children:"No live trade stream. The bot needs the Solana RPC firehose (free Helius key) or a PumpPortal API key to score coins \\u2014 see Setup & help."}),t("div",{class:"card",children:[t("h2",{children:"Data feeds"}),t("div",{class:"tablewrap",children:t("table",{children:[t("thead",{children:t("tr",{children:[t("th",{children:"Feed"}),t("th",{children:"Status"}),t("th",{class:"r",children:"Messages"}),t("th",{class:"r",children:"Last"}),t("th",{class:"r",children:"Reconnects"})]})}),t("tbody",{children:e.feeds.map(i=>t("tr",{children:[t("td",{children:[i.name," ",i.critical&&t(x,{children:"primary"})]}),t("td",{style:"white-space:normal",children:[t("span",{class:`dot ${i.status==="open"?"on":i.status==="connecting"?"mid":"off"}`,style:"display:inline-block;margin-right:6px"}),i.status,i.note?t("span",{class:"faint",children:[" \\xB7 ",i.note]}):null]}),t("td",{class:"r num",children:i.msgs.toLocaleString()}),t("td",{class:"r num",children:i.lastMsgAt?`${Math.round((a-i.lastMsgAt)/1e3)}s`:"\\u2014"}),t("td",{class:"r num",children:i.reconnects})]},i.name))})]})})]}),t("div",{class:"grid two",children:[t("div",{class:"card",children:[t("h2",{children:"Engine"}),t("dl",{class:"kv",children:[t("dt",{children:"Dashboard link"}),t("dd",{children:n?"live":"reconnecting\\u2026"}),t("dt",{children:"Uptime"}),t("dd",{children:[(e.uptimeSec/3600).toFixed(1)," h"]}),e.dataDir&&t(M,{children:[t("dt",{children:"Data folder"}),t("dd",{style:"word-break:break-all",children:e.dataDir})]}),e.saved&&t(M,{children:[t("dt",{children:"Settings saved"}),t("dd",{class:e.saved.failures>=3?"bad":"",children:[e.saved.at?`${Math.max(0,Math.round((a-e.saved.at)/1e3))} s ago`:"nothing to save yet",e.saved.failures>0&&` \\xB7 ${e.saved.failures} failed in a row`]})]}),t("dt",{children:"Events processed"}),t("dd",{children:e.events?.toLocaleString()}),t("dt",{children:"Coins in memory / scored"}),t("dd",{children:[e.tokens," / ",e.scored]}),t("dt",{children:"Launches \\xB7 trades seen"}),t("dd",{children:[e.creates?.toLocaleString()," \\xB7 ",e.trades?.toLocaleString()]}),t("dt",{children:"PumpSwap swaps (unmapped)"}),t("dd",{children:[e.ammSwaps?.toLocaleString()," (",e.unmappedAmm,")"]}),t("dt",{children:"Reserve convention"}),t("dd",{children:e.ammReserveConvention}),t("dt",{children:"Wallets / smart"}),t("dd",{children:[e.wallets?.toLocaleString()," / ",e.smartWallets]}),t("dt",{children:"Outcomes tracking / resolved"}),t("dd",{children:[e.hypotheticalsOpen?.toLocaleString()," / ",e.samplesResolved?.toLocaleString()]}),t("dt",{children:"Errors \\xB7 bad events"}),t("dd",{children:[e.errors," \\xB7 ",e.badEvents]}),t("dt",{children:"Event-loop lag"}),t("dd",{children:[e.loopLagMs??0," ms"]}),t("dt",{children:"Memory \\xB7 data"}),t("dd",{children:[e.memMb??"?"," MB \\xB7 ",e.storage?`${(e.storage.usedMb/1e3).toFixed(1)} of ${(e.storage.maxMb/1e3).toFixed(0)} GB${e.storage.auto?" (automatic: a fifth of the disk)":""}`:`${e.diskMb??"?"} MB`]}),e.storage&&t(M,{children:[t("dt",{children:"Data kept"}),t("dd",{children:["outcomes ",((e.storage.byDir?.samples??0)/1e3).toFixed(1)," GB \\xB7 raw recordings ",((e.storage.byDir?.record??0)/1e3).toFixed(1)," GB"]}),e.storage.learnSamples&&t(M,{children:[t("dt",{children:"Learning uses"}),t("dd",{children:["the newest ",e.storage.learnSamples.toLocaleString("en-US")," outcomes",e.storage.learnScale>1?` (${e.storage.learnScale}\\xD7 \\u2014 this computer has the memory)`:""]})]}),t("dt",{children:"Disk free"}),t("dd",{class:e.storage.recordingPaused||e.storage.freeMb!==null&&e.storage.freeMb<2*e.storage.minFreeMb?"bad":"",children:[e.storage.freeMb===null?"unknown":`${(e.storage.freeMb/1e3).toFixed(1)} GB`,e.storage.recordingPaused?" \\xB7 raw recording paused (disk nearly full)":` \\xB7 kept above ${(e.storage.minFreeMb/1e3).toFixed(0)} GB`]})]})]})]}),t("div",{class:"card",children:[t("h2",{children:"Server configuration"}),t("dl",{class:"kv",children:Object.entries(e.config??{}).map(([i,l])=>t(M,{children:[t("dt",{children:i}),t("dd",{children:Array.isArray(l)?l.join(", "):String(l)})]}))})]})]}),t("div",{class:"card",children:[t("h2",{children:"Recent log"}),t("div",{class:"tablewrap",style:"max-height:340px;overflow-y:auto",children:t("table",{children:t("tbody",{children:o.map((i,l)=>t("tr",{children:[t("td",{class:"faint num",children:fe(i.ts)}),t("td",{children:t(x,{tone:i.level==="error"?"bad":i.level==="warn"?"warn":void 0,children:i.level})}),t("td",{style:"white-space:normal",children:i.msg})]},l))})})})]})]})}function Ho(){return t("div",{class:"card",style:"margin-top:12px",children:[t("h2",{children:"How it works"}),t("p",{style:"margin-top:0",children:"The bot runs on a computer that stays on \\u2014 yours, a VPS or a cloud container \\u2014 not in this page. Closing the browser or locking your phone does not stop it; Telegram keeps you posted when you are away."}),t("p",{class:"muted",style:"font-size:13px;margin-bottom:0",children:"Live orders are built by PumpPortal\'s local API (0.5% fee), signed on your computer (the key never leaves it), sent through your RPC and confirmed; the real fill is read back from the chain. Four errors in a row or the daily limit pause live entries; exits always go through. A stop loss is a market sell, not a guarantee: in a rug the fill can land far below it."})]})}function ft(e,n){try{let o=localStorage.getItem(`signal.${e}`);return o===null?n:JSON.parse(o)}catch{return n}}function An(e,n){try{localStorage.setItem(`signal.${e}`,JSON.stringify(n))}catch{}}function Fn({open:e}){let n=P(m=>m.rows),o=P(m=>m.solUsd),r=P(m=>m.settings),[a,s]=b(ft("stage","all")),[i,l]=b(ft("sort","score")),[d,p]=b(ft("minview",0)),c=r?.minScore??75,u=n.filter(m=>(a==="all"||m.stage===a)&&m.score>=d);u=[...u].sort((m,_)=>i==="new"?_.createdAt-m.createdAt:i==="mcap"?_.mcapSol-m.mcapSol:_.score-m.score);let g=n.filter(m=>m.score>=c).length,f=(m,_,v,w,T)=>t("button",{class:"chip","aria-pressed":_===m,onClick:()=>{v(m),An(w,m)},children:T});return t("div",{children:[t("div",{class:"section-title",children:[t("h2",{children:"Live radar"}),t("span",{class:"muted num",children:[n.length," coins scored \\xB7 ",t("b",{class:"flare",children:g})," at \\u2265 ",c]})]}),t("div",{class:"row wrap",style:"gap:8px;margin-bottom:12px",children:[t("div",{class:"chips",children:[f("all",a,s,"stage","All"),f("curve",a,s,"stage","Bonding curve"),f("amm",a,s,"stage","Graduated")]}),t("div",{class:"chips",children:[f("score",i,l,"sort","Top score"),f("new",i,l,"sort","Newest"),f("mcap",i,l,"sort","Market cap")]}),t("div",{class:"chips",children:[0,50,c].map(m=>t("button",{class:"chip","aria-pressed":d===m,onClick:()=>{p(m),An("minview",m)},children:m===0?"Any score":`\\u2265 ${m}`},m))})]}),u.length===0?t(D,{children:n.length===0?"Waiting for coins\\u2026 the radar fills as launches and trades stream in.":"No coins match these filters right now."}):t("div",{class:"list",children:u.map(m=>t(zo,{r:m,solUsd:o,threshold:c,onOpen:()=>e(m.mint)},m.mint))})]})}function zo({r:e,solUsd:n,threshold:o,onOpen:r}){let a=e.why.filter(i=>i.points>0).slice(0,2),s=e.why.filter(i=>i.points<0).slice(0,1);return t("button",{class:`coin ${e.held?"held":""}`,onClick:r,children:[t(ze,{value:e.score,small:e.stage==="amm"?"DEX":"CURVE"}),t("div",{class:"body",children:[t("div",{class:"title",children:[t("span",{class:"sym",children:["$",e.symbol||"?"]}),t("span",{class:"name",children:e.name}),e.held&&t(x,{tone:"flare",children:"holding"}),e.score>=o&&!e.held&&(e.spent?t(x,{children:"passed"}):t(x,{tone:"good",children:"signal"}))]}),t("div",{class:"meta num",children:[t("span",{children:ee(e.mcapSol,n)}),t("span",{children:[ae(e.ageSec)," old"]}),t("span",{class:e.net60>=0?"good":"bad",children:[e.net60>=0?"+":"",e.net60.toFixed(2)," SOL/1m"]}),t("span",{children:[e.buyers," buyers"]}),t("span",{children:["top10 ",y(e.top10)]})]}),e.stage==="curve"&&t("div",{class:"bar",title:`bonding curve ${y(e.progress)}`,children:t("i",{style:{width:`${Math.max(2,e.progress*100)}%`}})}),t("div",{class:"why",children:[a.map(i=>`\\u25B2 ${i.note||i.label}`).join("  "),s.length>0&&`  \\u25BC ${s[0].note||s[0].label}`]}),e.flags.length>0&&t("div",{class:"chips",style:"margin-top:6px",children:e.flags.slice(0,4).map(i=>t(x,{tone:/smart|leader/.test(i)?"good":/bundled|dev sold|serial|concentrated|copycat/.test(i)?"bad":void 0,children:i},i))})]})]})}function En({mint:e,close:n}){let o=P(c=>c.solUsd),r=P(c=>c.settings),[a,s]=b(null),[i,l]=b("");A(()=>{let c=!0,u=()=>k(`/api/token/${encodeURIComponent(e)}`).then(m=>c&&s(m)).catch(m=>c&&l(String(m.message??m)));u();let g=setInterval(u,3e3),f=m=>m.key==="Escape"&&n();return window.addEventListener("keydown",f),()=>{c=!1,clearInterval(g),window.removeEventListener("keydown",f)}},[e]);let d=a?.score,p=Math.max(8,...(d?.contributions??[]).map(c=>Math.abs(c.points)));return t("div",{class:"sheet-bg",onClick:c=>c.target===c.currentTarget&&n(),children:t("div",{class:"sheet",role:"dialog","aria-modal":"true","aria-label":"coin details",children:[t("div",{class:"grab"}),!a&&!i&&t(D,{children:"Loading\\u2026"}),i&&t(D,{children:i}),a&&t("div",{class:"grid",children:[t("div",{class:"row",style:"align-items:flex-start",children:[d&&t(ze,{value:d.score,small:a.stage==="amm"?"DEX":"CURVE"}),t("div",{style:"flex:1;min-width:0",children:[t("div",{style:"font-size:19px;font-weight:780",children:["$",a.symbol||"?"]}),t("div",{class:"muted",style:"overflow:hidden;text-overflow:ellipsis",children:a.name}),t("div",{class:"chips",style:"margin-top:6px",children:[t(x,{children:a.stage==="curve"?`curve ${y(a.progress)}`:a.stage==="amm"?"graduated \\xB7 PumpSwap":"migrating"}),d?.calibrated&&t(x,{tone:"good",children:["P(win) ",y(d.p)]}),a.narrative?.clusterSize>1&&t(x,{tone:a.narrative.isLeader?"good":"bad",children:[a.narrative.isLeader?"leads":"follows"," a ",a.narrative.clusterSize,"-coin narrative"]}),a.partial&&t(x,{tone:"warn",children:"joined late"})]})]}),t("button",{class:"btn ghost",onClick:n,"aria-label":"close",children:"\\u2715"})]}),t(Uo,{d:a,threshold:r?.minScore??75,enabled:!!r?.enabled}),t("div",{class:"stats",children:[t("div",{class:"stat",children:[t("div",{class:"k",children:"Market cap"}),t("div",{class:"v num",children:ee(a.mcapSol,o)}),o>0&&t("div",{class:"s num",children:[a.mcapSol.toFixed(1)," SOL"]})]}),t("div",{class:"stat",children:[t("div",{class:"k",children:"Peak"}),t("div",{class:"v num",children:ee(a.athMcapSol,o)}),t("div",{class:"s num",children:a.mcapSol>0?`${((a.mcapSol/a.athMcapSol-1)*100).toFixed(0)}% from peak`:""})]}),t("div",{class:"stat",children:[t("div",{class:"k",children:"Age"}),t("div",{class:"v num",children:ae((Date.now()-a.createdAt)/1e3)})]}),t("div",{class:"stat",children:[t("div",{class:"k",children:"Holders"}),t("div",{class:"v num",children:a.concentration?.holders??"\\u2014"}),t("div",{class:"s",children:["top10 ",y(a.concentration?.top10)]})]})]}),t("div",{class:"row wrap",style:"gap:8px",children:[N.demo?t("span",{class:"faint",style:"font-size:12.5px",children:"Simulated coin \\u2014 no explorer links in the demo."}):t(M,{children:[t("a",{class:"btn sm",href:`https://pump.fun/coin/${a.mint}`,target:"_blank",rel:"noopener",children:"pump.fun"}),t("a",{class:"btn sm",href:`https://dexscreener.com/solana/${a.mint}`,target:"_blank",rel:"noopener",children:"DexScreener"}),t("a",{class:"btn sm",href:`https://solscan.io/token/${a.mint}`,target:"_blank",rel:"noopener",children:"Solscan"}),a.meta?.twitter&&t("a",{class:"btn sm",href:a.meta.twitter,target:"_blank",rel:"noopener",children:"X / Twitter"}),a.meta?.telegram&&t("a",{class:"btn sm",href:a.meta.telegram,target:"_blank",rel:"noopener",children:"Telegram"})]}),t("button",{class:"btn sm",onClick:()=>{navigator.clipboard?.writeText(a.mint).catch(()=>{})},children:"Copy address"})]}),d&&t("div",{class:"card flat",children:[t("h3",{children:"Why this score"}),t("div",{class:"contrib",children:d.contributions.map(c=>t(M,{children:[t("div",{children:[t("div",{style:"font-weight:650",children:[c.label," ",t("span",{class:"faint num",children:["\\xB7 ",c.value]})]}),t("div",{class:"cbar","aria-hidden":"true",children:[t("span",{class:"mid"}),t("i",{style:{left:c.points>=0?"50%":`${50-Math.abs(c.points)/p*50}%`,width:`${Math.abs(c.points)/p*50}%`,background:c.points>=0?"var(--good)":"var(--bad)"}})]})]}),t("div",{class:`num ${c.points>=0?"good":"bad"}`,style:"text-align:right",children:[c.points>=0?"+":"",c.points.toFixed(1)," pts",t("div",{class:"faint",style:"font-size:11px",children:c.note})]})]}))})]}),t("div",{class:"grid two",children:[t("div",{class:"card flat",children:[t("h3",{children:"Top holders"}),a.holders.length===0?t(D,{children:"No holders tracked yet."}):t("div",{class:"tablewrap",children:t("table",{children:t("tbody",{children:a.holders.map(c=>t("tr",{children:[t("td",{class:"mono",children:t("a",{href:N.demo?void 0:`https://solscan.io/account/${c.addr}`,target:"_blank",rel:"noopener",children:ce(c.addr)})}),t("td",{children:[c.dev&&t(x,{tone:"bad",children:"dev"})," ",c.bundle&&t(x,{tone:"bad",children:"bundle"})," ",c.early&&!c.bundle&&t(x,{tone:"warn",children:"sniper"})," ",c.smart&&t(x,{tone:"good",children:"smart"})]}),t("td",{class:"r num",children:[c.pct.toFixed(2),"%"]})]},c.addr))})})})]}),t("div",{class:"card flat",children:[t("h3",{children:"Latest trades"}),t("div",{class:"tablewrap",style:"max-height:320px;overflow-y:auto",children:t("table",{children:t("tbody",{children:a.trades.map((c,u)=>t("tr",{children:[t("td",{class:"faint num",children:fe(c.ts)}),t("td",{class:c.buy?"good":"bad",children:c.buy?"buy":"sell"}),t("td",{class:"r num",children:[c.sol.toFixed(3)," SOL"]}),t("td",{class:"mono faint",children:ce(c.user)})]},u))})})})]})]}),a.creatorStats&&t("div",{class:"card flat",children:[t("h3",{children:"Dev"}),t("dl",{class:"kv",children:[t("dt",{children:"Wallet"}),t("dd",{class:"mono",children:t("a",{href:N.demo?void 0:`https://solscan.io/account/${a.creator}`,target:"_blank",rel:"noopener",children:ce(a.creator)})}),t("dt",{children:"Launches (24h / seen)"}),t("dd",{children:[a.creatorStats.launches24h," / ",a.creatorStats.launches]}),t("dt",{children:"Best previous coin"}),t("dd",{children:a.creatorStats.best?`${a.creatorStats.best.toFixed(0)} SOL mcap`:"\\u2014"}),t("dt",{children:"Dev holds / sold"}),t("dd",{children:[y(a.features?.devShare,1)," / ",y(a.features?.devSold)]})]})]}),a.positions?.length>0&&t("div",{class:"card flat",children:[t("h3",{children:"Your trades on this coin"}),a.positions.map(c=>t("div",{class:"row",style:"justify-content:space-between;padding:6px 0",children:[t("span",{children:[c.mode," \\xB7 ",c.status," ",c.exitReason?`\\xB7 ${c.exitReason}`:""]}),t("span",{class:`num ${(c.pnl??c.proceeds+c.value-c.cost)>=0?"good":"bad"}`,children:[j((c.pnl??c.proceeds+c.value-c.cost)||0)," SOL"]})]},c.id))]})]})]})})}function Uo({d:e,threshold:n,enabled:o}){let r=e.entry;if(!r)return null;let a=r.signals?.[r.signals.length-1],s=e.score?.score??0,i="",l;if(a){let d=a.decision==="entered"?"the bot bought it":a.decision==="pending"?"the bot is buying it":a.decision==="failed"?`the buy failed (${a.reason??"no fill"})`:`not bought \\u2014 ${Ye[a.reason]??a.reason}`;i=a.decision==="entered"||a.decision==="pending"?"good":"warn",l=`Entry moment at ${fe(a.ts)}, score ${Math.round(a.score)}: ${d}. Each coin gets one entry moment.`}else r.spent?l="Its entry moment has passed (before the current settings, or before this session). Each coin gets one.":s>=n?(i="good",l=o?`At your score \\u2014 buying once it holds ${r.need} evaluations in a row (${r.above}/${r.need}).`:"At your score, but auto-trading is paused."):l=`Below your score of ${n}. If it gets there and holds, that is its entry moment.`;return t("div",{class:`entrymoment ${i}`,role:"status",children:l})}var qo={tp:"take profit",sl:"stop loss",trail:"trailing stop",initials:"stake back",time:"max hold time",dead:"coin went quiet",manual:"closed by you",kill:"kill switch",external:"not in wallet"};function Rn({open:e}){let n=P(s=>s.account),o=P(s=>s.solUsd);if(!n)return t(D,{children:"Loading\\u2026"});let r=n.closed.filter(s=>s.status==="closed"),a=n.wins+n.losses>0?n.wins/(n.wins+n.losses):NaN;return t("div",{children:[t("div",{class:"section-title",children:[t("h2",{children:n.mode==="live"?"Live trading":"Paper trading"}),t("span",{class:"muted",children:n.mode==="live"?"real SOL":"simulated fills on the real order flow"})]}),t("div",{class:"card",children:[t("div",{class:"stats",children:[t(we,{k:n.mode==="live"?"Realized":"Paper equity",v:n.mode==="live"?`${j(n.realized)} SOL`:`${j(n.equity)} SOL`,s:n.mode==="live"?void 0:`cash ${j(n.paperBalance)} + open ${j(n.openValue)}${n.deposits?` \\xB7 you added ${j(n.deposits)}`:""}`}),t(we,{k:"Today",v:`${n.dayPnl>=0?"+":""}${j(n.dayPnl)} SOL`,tone:n.dayPnl>0?"good":n.dayPnl<0?"bad":""}),t(we,{k:"All time",v:`${n.realized>=0?"+":""}${j(n.realized)} SOL`,tone:n.realized>0?"good":n.realized<0?"bad":"",s:`fees paid ${j(n.fees)} SOL`}),t(we,{k:"Win rate",v:Number.isFinite(a)?`${(a*100).toFixed(0)}%`:"\\u2014",s:`${n.wins} won \\xB7 ${n.losses} lost`})]}),t("div",{style:"margin-top:10px",children:t(Yt,{points:n.equityCurve})}),n.mode!=="live"&&t(jo,{})]}),t("div",{class:"section-title",children:[t("h2",{children:"Open positions"}),t("span",{class:"muted num",children:n.open.length})]}),n.open.length===0?t(D,{children:"No open positions. When a coin reaches your score, the bot buys it here."}):t("div",{class:"list",children:n.open.map(s=>t(Wo,{p:s,solUsd:o,open:e},s.id))}),t("div",{class:"section-title",children:[t("h2",{children:"Closed"}),t("span",{class:"muted num",children:[r.length," recent"]})]}),n.closed.length===0?t(D,{children:"Closed trades appear here with their exit reason and result after fees."}):t("div",{class:"card flat",style:"padding:4px 8px",children:t("div",{class:"tablewrap",children:t("table",{children:[t("thead",{children:t("tr",{children:[t("th",{children:"Coin"}),t("th",{children:"Exit"}),t("th",{class:"r",children:"Score"}),t("th",{class:"r",children:"Held"}),t("th",{class:"r",children:"Result"})]})}),t("tbody",{children:n.closed.map(s=>t("tr",{style:"cursor:pointer",onClick:()=>e(s.mint),children:[t("td",{children:[t("b",{children:["$",s.symbol||"?"]})," ",t("span",{class:"faint",children:s.mode==="live"?"live":""})]}),t("td",{children:s.status==="failed"?t(x,{tone:"warn",children:["not filled \\xB7 ",s.exitReason]}):qo[s.exitReason??""]??s.exitReason}),t("td",{class:"r num",children:Math.round(s.signalScore)}),t("td",{class:"r num",children:s.closedAt?ae((s.closedAt-s.openedAt)/1e3):"\\u2014"}),t("td",{class:`r num ${(s.pnl??0)>0?"good":(s.pnl??0)<0?"bad":""}`,children:[s.status==="failed"?"\\u2014":`${(s.pnlPct??0)>=0?"+":""}${(s.pnlPct??0).toFixed(1)}%`,t("div",{class:"faint",style:"font-size:11px",children:s.status==="failed"?"":`${j(s.pnl??0)} SOL`})]})]},s.id))})]})})})]})}function Wo({p:e,solUsd:n,open:o}){let a=((e.cost>0?(e.proceeds+e.value)/e.cost:1)-1)*100,s=e.plan.tpPct,i=e.plan.slPct,l=s+i,d=Math.min(1,Math.max(0,(a+i)/l)),p=async()=>{try{await k(`/api/positions/${encodeURIComponent(e.id)}/close`,{}),S("Sell order sent")}catch(c){S(String(c.message))}};return t("div",{class:"card flat",children:[t("div",{class:"row",children:[t("button",{class:"btn ghost",style:"padding:0;min-height:0;text-align:left;flex:1",onClick:()=>o(e.mint),children:[t("div",{style:"font-weight:760;font-size:15px",children:["$",e.symbol||"?"," ",t("span",{class:"faint",style:"font-weight:500;font-size:12.5px",children:e.name})]}),t("div",{class:"muted num",style:"font-size:12.5px",children:[e.status==="opening"?"buying\\u2026":e.status==="closing"?"selling\\u2026":`held ${ae((Date.now()-e.openedAt)/1e3)}`," \\xB7 score ",Math.round(e.signalScore)," \\xB7 in at ",ee(e.entryMcapSol||e.signalMcapSol,n),e.tpHit?" \\xB7 trailing":""]})]}),t("div",{style:"text-align:right",children:[t("div",{class:`num ${a>=0?"good":"bad"}`,style:"font-size:19px;font-weight:780",children:e.status==="opening"?"\\u2026":`${a>=0?"+":""}${a.toFixed(1)}%`}),t("div",{class:"faint num",style:"font-size:12px",children:[j(e.cost)," SOL in"]})]})]}),t("div",{style:"margin-top:10px",children:[t("div",{class:"row faint num",style:"justify-content:space-between;font-size:11.5px",children:[t("span",{children:["SL \\u2212",i,"%"]}),t("span",{children:"entry"}),t("span",{children:["TP +",s,"%"]})]}),t("div",{class:"cbar",style:"margin-top:4px;height:10px",children:[t("span",{class:"mid",style:{left:`${i/l*100}%`}}),t("i",{style:{left:`calc(${d*100}% - 5px)`,width:"10px",background:a>=0?"var(--good)":"var(--bad)",borderRadius:"5px"}})]})]}),t("div",{class:"row",style:"justify-content:space-between;margin-top:10px",children:[t("span",{class:"faint",style:"font-size:12px",children:e.notes.slice(-1)[0]??`opened ${Q(e.openedAt)}`}),t("button",{class:"btn sm",disabled:e.status!=="open",onClick:p,children:"Sell now"})]})]})}function jo(){let[e,n]=b("1000"),[o,r]=b(!1),a=async()=>{r(!0);try{let s=await k("/api/paper/add",{sol:Number(e)});S(`Added ${Number(e).toLocaleString("en-US")} paper SOL \\u2014 cash now ${j(s.paperBalance)} SOL`),q()}catch(s){S(String(s.message))}finally{r(!1)}};return t("div",{style:"margin-top:10px",children:[t("p",{class:"muted",style:"margin:0 0 6px;font-size:13px",children:"Paper money running low? Top it up \\u2014 your history and results stay (the chart shows results only)."}),t("div",{class:"row",style:"gap:8px",children:[t("input",{class:"inp",style:"max-width:110px",inputMode:"decimal","aria-label":"paper SOL to add",value:e,onInput:s=>n(s.target.value)}),t("button",{class:"btn sm",disabled:o||!(Number(e)>0),onClick:a,children:o?"Adding\\u2026":"Add paper SOL"})]})]})}var Cn=[["radar","Radar"],["trades","Trades"],["bot","Bot"],["learn","Learn"],["more","More"]],On=e=>Cn.some(([n])=>n===e);function Vo(){let e=location.hash.replace("#","");return On(e)?e:"radar"}function Ko(){let[e,n]=b(""),[o,r]=b(""),[a,s]=b(!1);return t("div",{class:"login",children:[t("div",{class:"brand",style:"font-size:15px;margin-bottom:18px",children:[t(Nn,{})," SIGNAL"]}),t("form",{class:"card",onSubmit:async l=>{l.preventDefault(),s(!0),r("");try{await k("/api/login",{token:e}),await q(),He()}catch(d){r(String(d.message))}finally{s(!1)}},children:[t("h2",{children:"Unlock the dashboard"}),t("p",{class:"muted",style:"margin-top:0",children:"Enter the access token printed in the server log on first start (or your DASHBOARD_TOKEN)."}),t("input",{id:"token",class:"inp",style:"max-width:none",type:"password",autoComplete:"current-password",placeholder:"access token",value:e,onInput:l=>n(l.target.value)}),o&&t("p",{class:"bad",style:"margin:8px 0 0",children:o}),t("button",{class:"btn primary",style:"margin-top:12px;width:100%",disabled:a||!e,children:a?"Checking\\u2026":"Unlock"})]})]})}function Nn(){return t("svg",{width:"22",height:"22",viewBox:"0 0 32 32","aria-hidden":"true",children:[t("rect",{width:"32",height:"32",rx:"7",fill:"var(--ink)"}),t("path",{d:"M6 22 L12 14 L17 18 L26 8",stroke:"var(--flare)","stroke-width":"3.2",fill:"none","stroke-linecap":"round","stroke-linejoin":"round"})]})}function Go({health:e}){let n=e.feeds.filter(s=>s.critical&&s.status!=="off");if(e.uptimeSec<60&&n.some(s=>s.status==="connecting"||s.status==="open"&&!s.msgs))return t("div",{class:"banner sim",children:"Connecting to the live market data\\u2026"});let o=n.map(s=>s.note).find(s=>!!s)??"",r=n.some(s=>/solana\\.com$/i.test(s.host??"")),a=/\\b429\\b/.test(o)?r?"The free public feed is limiting this connection; it retries by itself. If it keeps happening, stream through your own key (More \\u2192 Setup).":"The data provider is limiting requests (plan limit reached?).":/\\b40[13]\\b/.test(o)?r?"The free public feed refused the connection; it retries by itself.":"The data provider refused the key: paste it again in More \\u2192 Setup.":o?`Reason: ${o}`:"";return t("div",{class:"banner bad",children:[t("span",{style:"flex:1",children:["Live data feed is down \\u2014 the bot will not open trades until it recovers.",a&&t("span",{style:"font-weight:500",children:[" ",a]})]}),t("button",{class:"btn sm",onClick:()=>ue("more","health"),children:"Details"})]})}function Dn(){let e=P(m=>m.authed),n=P(m=>m.settings),o=P(m=>m.account),r=P(m=>m.health),a=P(m=>m.connected),s=P(m=>m.toast),i=P(m=>m.nav),[l,d]=b(Vo()),[p,c]=b(null);if(A(()=>{i&&On(i.tab)&&(d(i.tab),c(null),window.scrollTo({top:0}))},[i?.at]),A(()=>{q().then(()=>{lt().authed&&He()});let m=setInterval(()=>void q(),15e3),_=()=>{document.visibilityState==="visible"&&q().then(()=>lt().authed&&He())};return document.addEventListener("visibilitychange",_),()=>{clearInterval(m),Gt(),document.removeEventListener("visibilitychange",_)}},[]),e===!1&&!N.demo)return t(Ko,{});if(e!==!0||!n)return t("div",{class:"empty",style:"margin-top:30vh",children:N.demo?"Starting the simulated market\\u2026":"Connecting to SIGNAL\\u2026"});let u=!r?.feedDown,g=m=>{d(m);try{history.replaceState(null,"",`#${m}`)}catch{}window.scrollTo({top:0})},f=o?.dayPnl??0;return t("div",{class:"app",children:[t("header",{class:"top",children:t("div",{class:"top-row",children:[t("div",{class:"brand",children:[t(Nn,{})," SIGNAL"]}),t("span",{class:"pill",title:u?"data feeds live":"data feed down",children:[t("span",{class:`dot ${a?u?"on":"off":"mid"}`}),n.enabled?"Trading":"Paused"," \\xB7 ",n.mode==="live"?"LIVE":"paper"]}),t("span",{class:"spacer"}),t("span",{class:`top-pnl num ${f>0?"good":f<0?"bad":"muted"}`,title:"today, SOL",children:[jt(f)," SOL"]})]})}),r?.simulated&&t("div",{class:"banner sim",children:[t("span",{style:"flex:1",children:N.demo?"DEMO \\u2014 the real engine on a simulated market in this page. Fake coins, fake money.":"SIMULATED MARKET \\u2014 demo data, not real coins or prices."}),N.bannerAction?.()]}),o?.killed&&t("div",{class:"banner bad",children:"Kill switch is ON \\u2014 no new entries."}),r&&r.feedDown&&!r.simulated&&t(Go,{health:r}),!N.demo&&(r?.saved?.failures??0)>=3&&t("div",{class:"banner bad",children:t("span",{style:"flex:1",children:["Settings and trades are not being saved (",r.saved.error,"). Check that the bot\'s folder is not read-only, full, or synced by OneDrive."]})}),!N.demo&&r?.update?.available&&r.update.can&&t("div",{class:"banner info",children:[t("span",{style:"flex:1",children:"A new version of SIGNAL is ready."}),t("button",{class:"btn sm",onClick:()=>ue("more","setup"),children:"Update"})]}),t("nav",{class:"tabs","aria-label":"sections",children:Cn.map(([m,_])=>t("button",{class:"tab","aria-current":l===m?"page":void 0,onClick:()=>g(m),children:[Xt[m],_]},m))}),t("main",{class:"main",children:[l==="radar"&&t(Fn,{open:c}),l==="trades"&&t(Rn,{open:c}),l==="bot"&&t(vn,{}),l==="learn"&&t(Tn,{}),l==="more"&&t(Ln,{open:c})]}),p&&t(En,{mint:p,close:()=>c(null)}),s&&t("div",{class:"toast",role:"status",children:s})]})}V({});Rt(t(Dn,{}),document.getElementById("root"));})();\n</script>\n</body>\n</html>\n') return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="theme-color" content="#0f1318">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<meta name="apple-mobile-web-app-title" content="SIGNAL">\n<title>SIGNAL</title>\n<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' rx=\'7\' fill=\'%230f1318\'/%3E%3Cpath d=\'M6 22 L12 14 L17 18 L26 8\' stroke=\'%23f2a93b\' stroke-width=\'3.2\' fill=\'none\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E">\n<style>\n:root{\n  --ground:#f5f6f8; --surface:#ffffff; --raised:#eef1f5; --line:#dde2ea; --line2:#c9d0db;\n  --ink:#10151c; --ink2:#4a5566; --ink3:#7a8596;\n  --flare:#b86e00; --flare-soft:#fbead0; --flare-ink:#1a1204;\n  --good:#138a5a; --good-soft:#dff3ea; --bad:#cc3340; --bad-soft:#fbe3e5; --warn:#9a7400; --warn-soft:#f7efcf; --info:#2f6fc0;\n  --shadow:0 1px 2px rgba(16,21,28,.06),0 6px 20px rgba(16,21,28,.06);\n  --r:12px; --r-sm:8px;\n  --mono:ui-monospace,"SF Mono","Cascadia Mono","JetBrains Mono",Menlo,Consolas,monospace;\n  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI Variable","Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,sans-serif;\n  color-scheme:light;\n}\n@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){\n  --ground:#0f1318; --surface:#161b22; --raised:#1d2430; --line:#262e3b; --line2:#334052;\n  --ink:#e7ebf2; --ink2:#a3adbd; --ink3:#6f7a8c;\n  --flare:#f2a93b; --flare-soft:#3a2a12; --flare-ink:#1a1204;\n  --good:#3ecf8e; --good-soft:#12301f; --bad:#ff6b6b; --bad-soft:#3a1519; --warn:#e8c547; --warn-soft:#332b0f; --info:#6aa8ff;\n  --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.25);\n  color-scheme:dark;\n}}\n:root[data-theme="dark"]{\n  --ground:#0f1318; --surface:#161b22; --raised:#1d2430; --line:#262e3b; --line2:#334052;\n  --ink:#e7ebf2; --ink2:#a3adbd; --ink3:#6f7a8c;\n  --flare:#f2a93b; --flare-soft:#3a2a12; --flare-ink:#1a1204;\n  --good:#3ecf8e; --good-soft:#12301f; --bad:#ff6b6b; --bad-soft:#3a1519; --warn:#e8c547; --warn-soft:#332b0f; --info:#6aa8ff;\n  --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.25);\n  color-scheme:dark;\n}\n*{box-sizing:border-box}\nhtml,body{margin:0;height:100%}\nbody{background:var(--ground);color:var(--ink);font:14px/1.45 var(--sans);-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}\nbutton,input,select{font:inherit;color:inherit}\na{color:var(--info);text-decoration:none}\n[hidden]{display:none!important}\n.num{font-variant-numeric:tabular-nums}\n.mono{font-family:var(--mono);font-size:12.5px}\n.muted{color:var(--ink2)} .faint{color:var(--ink3)}\n.good{color:var(--good)} .bad{color:var(--bad)} .warn{color:var(--warn)} .flare{color:var(--flare)}\n\n/* shell */\n.app{min-height:100%;display:flex;flex-direction:column}\n.top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--ground) 88%,transparent);backdrop-filter:saturate(1.4) blur(12px);-webkit-backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--line);padding:calc(env(safe-area-inset-top,0px) + 10px) 16px 10px}\n.top-row{display:flex;align-items:center;gap:10px;max-width:1180px;margin:0 auto}\n.brand{display:flex;align-items:center;gap:8px;font-weight:750;letter-spacing:.14em;font-size:13px}\n.brand svg{flex:none}\n.pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:650;border:1px solid var(--line);background:var(--surface);white-space:nowrap}\n.dot{width:8px;height:8px;border-radius:50%;background:var(--ink3);flex:none}\n.dot.on{background:var(--good);box-shadow:0 0 0 3px color-mix(in srgb,var(--good) 22%,transparent)}\n.dot.off{background:var(--bad)} .dot.mid{background:var(--warn)}\n.spacer{flex:1}\n.top-pnl{font-weight:700;font-size:15px;white-space:nowrap}\n.main{flex:1;width:100%;max-width:1180px;margin:0 auto;padding:14px 16px calc(84px + env(safe-area-inset-bottom,0px))}\n.tabs{position:fixed;left:0;right:0;bottom:0;z-index:30;display:flex;justify-content:space-around;background:color-mix(in srgb,var(--surface) 94%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);padding:6px 6px calc(6px + env(safe-area-inset-bottom,0px))}\n.tab{flex:1;max-width:120px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px;border:0;background:none;border-radius:10px;color:var(--ink3);font-size:11px;font-weight:600;cursor:pointer}\n.tab svg{width:22px;height:22px}\n.tab[aria-current="page"]{color:var(--flare)}\n.tab:focus-visible,.btn:focus-visible,.chip:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--flare);outline-offset:2px}\n@media (min-width:900px){\n  .tabs{position:sticky;top:57px;bottom:auto;justify-content:flex-start;gap:4px;padding:6px 16px;border-top:0;border-bottom:1px solid var(--line);background:var(--ground)}\n  .tab{flex:none;flex-direction:row;gap:8px;font-size:13px;padding:8px 14px;max-width:none}\n  .tab svg{width:18px;height:18px}\n  .tab[aria-current="page"]{background:var(--flare-soft)}\n  .main{padding-bottom:40px}\n}\n.banner{max-width:1180px;width:calc(100% - 32px);margin:10px auto 0;padding:10px 14px;border-radius:var(--r-sm);font-weight:600;font-size:13px;display:flex;gap:10px;align-items:center}\n.banner.sim{background:var(--warn-soft);color:var(--warn);border:1px solid color-mix(in srgb,var(--warn) 30%,transparent)}\n.banner.bad{background:var(--bad-soft);color:var(--bad);border:1px solid color-mix(in srgb,var(--bad) 30%,transparent)}\n.savebar{position:fixed;z-index:40;left:50%;transform:translateX(-50%);bottom:calc(76px + env(safe-area-inset-bottom,0px));width:min(640px,calc(100% - 24px));display:flex;gap:8px;align-items:center;padding:10px 12px;border-radius:var(--r);background:var(--surface);color:var(--ink);border:1px solid color-mix(in srgb,var(--flare) 55%,var(--line));box-shadow:var(--shadow);font-size:13px;font-weight:600}\n@media (min-width:900px){.savebar{bottom:20px}}\n.main:has(.savebar){padding-bottom:calc(150px + env(safe-area-inset-bottom,0px))}\n.banner.info{background:color-mix(in srgb,var(--info) 12%,var(--surface));color:var(--info);border:1px solid color-mix(in srgb,var(--info) 30%,transparent)}\n\n/* building blocks */\n.grid{display:grid;gap:12px}\n.grid > *{min-width:0}\n.main{overflow-x:clip}\n@media (min-width:760px){.grid.two{grid-template-columns:1fr 1fr}.grid.three{grid-template-columns:repeat(3,1fr)}}\n.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:14px;box-shadow:var(--shadow)}\n.card.flat{box-shadow:none}\n.card h2,.card h3{margin:0 0 10px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2);font-weight:700}\n.section-title{display:flex;align-items:baseline;gap:10px;margin:18px 2px 10px}\n.section-title h2{margin:0;font-size:17px;font-weight:720;text-wrap:balance}\n.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}\n@media (min-width:640px){.stats{grid-template-columns:repeat(4,1fr)}}\n.stat .k{font-size:11.5px;color:var(--ink3);text-transform:uppercase;letter-spacing:.06em;font-weight:650}\n.stat .v{font-size:20px;font-weight:720;margin-top:2px}\n.stat .s{font-size:12px;color:var(--ink2)}\n.row{display:flex;align-items:center;gap:10px}\n.wrap{flex-wrap:wrap}\n.chips{display:flex;gap:6px;flex-wrap:wrap}\n.chip{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:5px 11px;font-size:12.5px;font-weight:600;cursor:pointer;color:var(--ink2)}\n.chip[aria-pressed="true"]{background:var(--ink);color:var(--ground);border-color:var(--ink)}\n.tag{display:inline-block;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:650;background:var(--raised);color:var(--ink2);white-space:nowrap}\n.tag.good{background:var(--good-soft);color:var(--good)} .tag.bad{background:var(--bad-soft);color:var(--bad)} .tag.warn{background:var(--warn-soft);color:var(--warn)} .tag.flare{background:var(--flare-soft);color:var(--flare)}\n.btn{border:1px solid var(--line2);background:var(--surface);border-radius:10px;padding:9px 14px;font-weight:650;cursor:pointer;min-height:40px}\n.btn.primary{background:var(--flare);border-color:var(--flare);color:var(--flare-ink)}\n.btn.danger{background:var(--bad);border-color:var(--bad);color:#fff}\n.btn.ghost{background:none;border-color:transparent}\n.btn.sm{min-height:32px;padding:5px 10px;font-size:12.5px}\n.btn:disabled{opacity:.5;cursor:not-allowed}\n\n/* score badge */\n.score{flex:none;width:46px;height:46px;border-radius:12px;display:grid;place-items:center;font-weight:800;font-size:17px;background:var(--raised);color:var(--ink2);position:relative}\n.score small{position:absolute;bottom:3px;font-size:8.5px;font-weight:700;letter-spacing:.06em;opacity:.8}\n.score.b1{background:var(--raised);color:var(--ink3)}\n.score.b2{background:color-mix(in srgb,var(--flare) 16%,var(--surface));color:var(--ink)}\n.score.b3{background:var(--flare);color:var(--flare-ink)}\n\n/* radar list */\n.list{display:flex;flex-direction:column;gap:8px}\n.coin{display:flex;gap:12px;align-items:flex-start;padding:12px;border-radius:var(--r);background:var(--surface);border:1px solid var(--line);cursor:pointer;text-align:left;width:100%}\n.coin:hover{border-color:var(--line2)}\n.coin.held{border-color:var(--flare);box-shadow:inset 3px 0 0 var(--flare)}\n.coin .body{flex:1;min-width:0}\n.coin .title{display:flex;align-items:baseline;gap:6px;min-width:0}\n.coin .sym{font-weight:760;font-size:15px}\n.coin .name{color:var(--ink3);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.coin .meta{display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;font-size:12.5px;color:var(--ink2)}\n.coin .why{margin-top:6px;font-size:12px;color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.coin .right{text-align:right;flex:none}\n.bar{height:5px;border-radius:3px;background:var(--raised);overflow:hidden;margin-top:6px}\n.bar > i{display:block;height:100%;background:var(--flare);border-radius:3px}\n.img{width:34px;height:34px;border-radius:9px;object-fit:cover;background:var(--raised);flex:none}\n\n/* forms */\n.field{display:flex;flex-direction:column;gap:6px;padding:12px 0;border-bottom:1px solid var(--line)}\n.field:last-child{border-bottom:0}\n.field label{font-weight:650}\n.field .help{font-size:12.5px;color:var(--ink3)}\n.field .ctrl{display:flex;align-items:center;gap:10px}\n.inp{width:100%;max-width:140px;padding:9px 11px;border-radius:10px;border:1px solid var(--line2);background:var(--ground);font-variant-numeric:tabular-nums}\ninput[type=range]{flex:1;accent-color:var(--flare);height:32px}\n.switch{position:relative;width:48px;height:28px;flex:none}\n.switch input{opacity:0;width:0;height:0;position:absolute}\n.switch span{position:absolute;inset:0;border-radius:999px;background:var(--line2);transition:.15s}\n.switch span::after{content:"";position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:.15s}\n.switch input:checked + span{background:var(--flare)}\n.switch input:checked + span::after{transform:translateX(20px)}\n.switch input:focus-visible + span{outline:2px solid var(--flare);outline-offset:2px}\n.bigswitch{display:flex;align-items:center;gap:14px;padding:14px;border-radius:var(--r);border:1px solid var(--line);background:var(--surface)}\n.bigswitch.on{border-color:var(--good);background:color-mix(in srgb,var(--good) 7%,var(--surface))}\ndetails.more{border-top:1px solid var(--line);margin-top:6px}\ndetails.more summary{cursor:pointer;padding:12px 0;font-weight:650;color:var(--ink2)}\n\n/* tables */\n.tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch}\ntable{width:100%;border-collapse:collapse;font-size:13px}\nth{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3);font-weight:700;padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap}\ntd{padding:7px 8px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums;white-space:nowrap}\ntd.r,th.r{text-align:right}\ntr:last-child td{border-bottom:0}\n\n/* contribution bars */\n.contrib{display:grid;grid-template-columns:1fr 90px;gap:4px 10px;align-items:center;font-size:12.5px}\n.cbar{position:relative;height:8px;background:var(--raised);border-radius:4px}\n.cbar i{position:absolute;top:0;bottom:0;border-radius:4px}\n.cbar .mid{position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--line2)}\n\n/* sheet */\n.sheet-bg{position:fixed;inset:0;z-index:50;background:rgba(8,10,14,.5);display:flex;align-items:flex-end;justify-content:center}\n.sheet{width:100%;max-width:760px;max-height:92vh;overflow:auto;background:var(--ground);border-radius:18px 18px 0 0;padding:16px 16px calc(24px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px rgba(0,0,0,.35)}\n@media (min-width:760px){.sheet-bg{align-items:center}.sheet{border-radius:18px;max-height:86vh}}\n.grab{width:40px;height:5px;border-radius:3px;background:var(--line2);margin:0 auto 12px}\n.entrymoment{padding:10px 12px;border-radius:var(--r-sm);background:var(--raised);color:var(--ink2);font-size:13px}\n.entrymoment.good{background:var(--good-soft);color:var(--good)}\n.entrymoment.warn{background:var(--warn-soft);color:var(--warn)}\n\n.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(90px + env(safe-area-inset-bottom,0px));z-index:60;background:var(--ink);color:var(--ground);padding:10px 16px;border-radius:12px;font-weight:650;box-shadow:var(--shadow);max-width:calc(100% - 32px)}\n.empty{padding:28px 16px;text-align:center;color:var(--ink3)}\n.login{max-width:420px;margin:12vh auto;padding:0 16px}\n.hist{display:flex;align-items:flex-end;gap:3px;height:56px}\n.hist i{flex:1;background:var(--line2);border-radius:3px 3px 0 0;min-height:2px}\n.hist i.hot{background:var(--flare)}\n.spark{width:100%;height:64px;display:block}\n.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:13px}\n.kv dt{color:var(--ink3)} .kv dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis}\n.heat td{text-align:center;font-weight:650}\n.note{font-size:12.5px;margin:10px 0 0}\n.edge-meta{font-size:13px;color:var(--ink2);margin:10px 0 4px}\n.edge{display:grid;gap:3px;padding:10px 0;border-top:1px solid var(--line)}\n.edge-rule{font-weight:700}\n.strat{display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}\n.strat.active{box-shadow:inset 3px 0 0 var(--flare);padding-left:10px}\n.inp.wide{max-width:none;flex:1;min-width:0}\n.step .stepno{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--raised);font-weight:750;font-size:13px;flex:none}\n.step.done{border-color:color-mix(in srgb,var(--good) 35%,var(--line))}\n.step.done .stepno{background:var(--good-soft);color:var(--good)}\n.step.hot{border-color:color-mix(in srgb,var(--info) 45%,var(--line))}\n.step.hot .stepno{background:color-mix(in srgb,var(--info) 15%,var(--surface));color:var(--info)}\n.steps{margin:0;padding-left:20px;display:grid;gap:6px}\n.copyline{display:flex;gap:8px;align-items:center}\n.copyline code{flex:1;min-width:0;overflow-wrap:anywhere;font-family:var(--mono);font-size:12px;background:var(--raised);padding:6px 8px;border-radius:6px}\n.linkcode{font-size:20px;letter-spacing:.12em;color:var(--flare)}\n.learn-head{font-size:14px;color:var(--ink);text-wrap:pretty}\n.card h3.learn-sub{margin:14px 0 4px;font-size:12px}\n.fresh{display:grid;gap:4px;padding:10px 0;border-top:1px solid var(--line)}\n.drivers{display:grid;gap:9px;margin-top:8px}\n.driver{display:grid;grid-template-columns:16px 1fr auto;gap:2px 8px;align-items:center;font-size:13px}\n.driver .arrow{font-weight:800;text-align:center}\n.driver .bar,.driver .was{grid-column:2 / 4}\n.driver .bar{margin-top:2px}\n.driver .was{font-size:11.5px}\n@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}\n</style>\n</head>\n<body>\n<div id="root"></div>\n<script>"use strict";(()=>{var Oe,F,St,zn,le,yt,_t,kt,Mt,Ze,Qe,Xe,Un,ve={},Tt=[],qn=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,Ne=Array.isArray;function oe(e,n){for(var o in n)e[o]=n[o];return e}function et(e){e&&e.parentNode&&e.parentNode.removeChild(e)}function Wn(e,n,o){var r,a,s,i={};for(s in n)s=="key"?r=n[s]:s=="ref"?a=n[s]:i[s]=n[s];if(arguments.length>2&&(i.children=arguments.length>3?Oe.call(arguments,2):o),typeof e=="function"&&e.defaultProps!=null)for(s in e.defaultProps)i[s]===void 0&&(i[s]=e.defaultProps[s]);return Ee(e,i,r,a,null)}function Ee(e,n,o,r,a){var s={type:e,props:n,key:o,ref:r,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:a??++St,__i:-1,__u:0};return a==null&&F.vnode!=null&&F.vnode(s),s}function M(e){return e.children}function Re(e,n){this.props=e,this.context=n}function he(e,n){if(n==null)return e.__?he(e.__,e.__i+1):null;for(var o;n<e.__k.length;n++)if((o=e.__k[n])!=null&&o.__e!=null)return o.__e;return typeof e.type=="function"?he(e):null}function $t(e){var n,o;if((e=e.__)!=null&&e.__c!=null){for(e.__e=e.__c.base=null,n=0;n<e.__k.length;n++)if((o=e.__k[n])!=null&&o.__e!=null){e.__e=e.__c.base=o.__e;break}return $t(e)}}function vt(e){(!e.__d&&(e.__d=!0)&&le.push(e)&&!Ce.__r++||yt!=F.debounceRendering)&&((yt=F.debounceRendering)||_t)(Ce)}function Ce(){for(var e,n,o,r,a,s,i,l=1;le.length;)le.length>l&&le.sort(kt),e=le.shift(),l=le.length,e.__d&&(o=void 0,r=void 0,a=(r=(n=e).__v).__e,s=[],i=[],n.__P&&((o=oe({},r)).__v=r.__v+1,F.vnode&&F.vnode(o),tt(n.__P,o,r,n.__n,n.__P.namespaceURI,32&r.__u?[a]:null,s,a??he(r),!!(32&r.__u),i),o.__v=r.__v,o.__.__k[o.__i]=o,At(s,o,i),r.__e=r.__=null,o.__e!=a&&$t(o)));Ce.__r=0}function Pt(e,n,o,r,a,s,i,l,d,p,c){var u,g,f,m,_,v,w,T=r&&r.__k||Tt,U=n.length;for(d=jn(o,n,T,d,U),u=0;u<U;u++)(f=o.__k[u])!=null&&(g=f.__i==-1?ve:T[f.__i]||ve,f.__i=u,v=tt(e,f,g,a,s,i,l,d,p,c),m=f.__e,f.ref&&g.ref!=f.ref&&(g.ref&&nt(g.ref,null,f),c.push(f.ref,f.__c||m,f)),_==null&&m!=null&&(_=m),(w=!!(4&f.__u))||g.__k===f.__k?d=Lt(f,d,e,w):typeof f.type=="function"&&v!==void 0?d=v:m&&(d=m.nextSibling),f.__u&=-7);return o.__e=_,d}function jn(e,n,o,r,a){var s,i,l,d,p,c=o.length,u=c,g=0;for(e.__k=new Array(a),s=0;s<a;s++)(i=n[s])!=null&&typeof i!="boolean"&&typeof i!="function"?(d=s+g,(i=e.__k[s]=typeof i=="string"||typeof i=="number"||typeof i=="bigint"||i.constructor==String?Ee(null,i,null,null,null):Ne(i)?Ee(M,{children:i},null,null,null):i.constructor==null&&i.__b>0?Ee(i.type,i.props,i.key,i.ref?i.ref:null,i.__v):i).__=e,i.__b=e.__b+1,l=null,(p=i.__i=Vn(i,o,d,u))!=-1&&(u--,(l=o[p])&&(l.__u|=2)),l==null||l.__v==null?(p==-1&&(a>c?g--:a<c&&g++),typeof i.type!="function"&&(i.__u|=4)):p!=d&&(p==d-1?g--:p==d+1?g++:(p>d?g--:g++,i.__u|=4))):e.__k[s]=null;if(u)for(s=0;s<c;s++)(l=o[s])!=null&&(2&l.__u)==0&&(l.__e==r&&(r=he(l)),Et(l,l));return r}function Lt(e,n,o,r){var a,s;if(typeof e.type=="function"){for(a=e.__k,s=0;a&&s<a.length;s++)a[s]&&(a[s].__=e,n=Lt(a[s],n,o,r));return n}e.__e!=n&&(r&&(n&&e.type&&!n.parentNode&&(n=he(e)),o.insertBefore(e.__e,n||null)),n=e.__e);do n=n&&n.nextSibling;while(n!=null&&n.nodeType==8);return n}function Vn(e,n,o,r){var a,s,i,l=e.key,d=e.type,p=n[o],c=p!=null&&(2&p.__u)==0;if(p===null&&e.key==null||c&&l==p.key&&d==p.type)return o;if(r>(c?1:0)){for(a=o-1,s=o+1;a>=0||s<n.length;)if((p=n[i=a>=0?a--:s++])!=null&&(2&p.__u)==0&&l==p.key&&d==p.type)return i}return-1}function wt(e,n,o){n[0]=="-"?e.setProperty(n,o??""):e[n]=o==null?"":typeof o!="number"||qn.test(n)?o:o+"px"}function Fe(e,n,o,r,a){var s,i;e:if(n=="style")if(typeof o=="string")e.style.cssText=o;else{if(typeof r=="string"&&(e.style.cssText=r=""),r)for(n in r)o&&n in o||wt(e.style,n,"");if(o)for(n in o)r&&o[n]==r[n]||wt(e.style,n,o[n])}else if(n[0]=="o"&&n[1]=="n")s=n!=(n=n.replace(Mt,"$1")),i=n.toLowerCase(),n=i in e||n=="onFocusOut"||n=="onFocusIn"?i.slice(2):n.slice(2),e.l||(e.l={}),e.l[n+s]=o,o?r?o.u=r.u:(o.u=Ze,e.addEventListener(n,s?Xe:Qe,s)):e.removeEventListener(n,s?Xe:Qe,s);else{if(a=="http://www.w3.org/2000/svg")n=n.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(n!="width"&&n!="height"&&n!="href"&&n!="list"&&n!="form"&&n!="tabIndex"&&n!="download"&&n!="rowSpan"&&n!="colSpan"&&n!="role"&&n!="popover"&&n in e)try{e[n]=o??"";break e}catch{}typeof o=="function"||(o==null||o===!1&&n[4]!="-"?e.removeAttribute(n):e.setAttribute(n,n=="popover"&&o==1?"":o))}}function xt(e){return function(n){if(this.l){var o=this.l[n.type+e];if(n.t==null)n.t=Ze++;else if(n.t<o.u)return;return o(F.event?F.event(n):n)}}}function tt(e,n,o,r,a,s,i,l,d,p){var c,u,g,f,m,_,v,w,T,U,W,G,z,C,h,H,Y,I=n.type;if(n.constructor!=null)return null;128&o.__u&&(d=!!(32&o.__u),s=[l=n.__e=o.__e]),(c=F.__b)&&c(n);e:if(typeof I=="function")try{if(w=n.props,T="prototype"in I&&I.prototype.render,U=(c=I.contextType)&&r[c.__c],W=c?U?U.props.value:c.__:r,o.__c?v=(u=n.__c=o.__c).__=u.__E:(T?n.__c=u=new I(w,W):(n.__c=u=new Re(w,W),u.constructor=I,u.render=Gn),U&&U.sub(u),u.props=w,u.state||(u.state={}),u.context=W,u.__n=r,g=u.__d=!0,u.__h=[],u._sb=[]),T&&u.__s==null&&(u.__s=u.state),T&&I.getDerivedStateFromProps!=null&&(u.__s==u.state&&(u.__s=oe({},u.__s)),oe(u.__s,I.getDerivedStateFromProps(w,u.__s))),f=u.props,m=u.state,u.__v=n,g)T&&I.getDerivedStateFromProps==null&&u.componentWillMount!=null&&u.componentWillMount(),T&&u.componentDidMount!=null&&u.__h.push(u.componentDidMount);else{if(T&&I.getDerivedStateFromProps==null&&w!==f&&u.componentWillReceiveProps!=null&&u.componentWillReceiveProps(w,W),!u.__e&&u.shouldComponentUpdate!=null&&u.shouldComponentUpdate(w,u.__s,W)===!1||n.__v==o.__v){for(n.__v!=o.__v&&(u.props=w,u.state=u.__s,u.__d=!1),n.__e=o.__e,n.__k=o.__k,n.__k.some(function($){$&&($.__=n)}),G=0;G<u._sb.length;G++)u.__h.push(u._sb[G]);u._sb=[],u.__h.length&&i.push(u);break e}u.componentWillUpdate!=null&&u.componentWillUpdate(w,u.__s,W),T&&u.componentDidUpdate!=null&&u.__h.push(function(){u.componentDidUpdate(f,m,_)})}if(u.context=W,u.props=w,u.__P=e,u.__e=!1,z=F.__r,C=0,T){for(u.state=u.__s,u.__d=!1,z&&z(n),c=u.render(u.props,u.state,u.context),h=0;h<u._sb.length;h++)u.__h.push(u._sb[h]);u._sb=[]}else do u.__d=!1,z&&z(n),c=u.render(u.props,u.state,u.context),u.state=u.__s;while(u.__d&&++C<25);u.state=u.__s,u.getChildContext!=null&&(r=oe(oe({},r),u.getChildContext())),T&&!g&&u.getSnapshotBeforeUpdate!=null&&(_=u.getSnapshotBeforeUpdate(f,m)),H=c,c!=null&&c.type===M&&c.key==null&&(H=Ft(c.props.children)),l=Pt(e,Ne(H)?H:[H],n,o,r,a,s,i,l,d,p),u.base=n.__e,n.__u&=-161,u.__h.length&&i.push(u),v&&(u.__E=u.__=null)}catch($){if(n.__v=null,d||s!=null)if($.then){for(n.__u|=d?160:128;l&&l.nodeType==8&&l.nextSibling;)l=l.nextSibling;s[s.indexOf(l)]=null,n.__e=l}else{for(Y=s.length;Y--;)et(s[Y]);Je(n)}else n.__e=o.__e,n.__k=o.__k,$.then||Je(n);F.__e($,n,o)}else s==null&&n.__v==o.__v?(n.__k=o.__k,n.__e=o.__e):l=n.__e=Kn(o.__e,n,o,r,a,s,i,d,p);return(c=F.diffed)&&c(n),128&n.__u?void 0:l}function Je(e){e&&e.__c&&(e.__c.__e=!0),e&&e.__k&&e.__k.forEach(Je)}function At(e,n,o){for(var r=0;r<o.length;r++)nt(o[r],o[++r],o[++r]);F.__c&&F.__c(n,e),e.some(function(a){try{e=a.__h,a.__h=[],e.some(function(s){s.call(a)})}catch(s){F.__e(s,a.__v)}})}function Ft(e){return typeof e!="object"||e==null||e.__b&&e.__b>0?e:Ne(e)?e.map(Ft):oe({},e)}function Kn(e,n,o,r,a,s,i,l,d){var p,c,u,g,f,m,_,v=o.props,w=n.props,T=n.type;if(T=="svg"?a="http://www.w3.org/2000/svg":T=="math"?a="http://www.w3.org/1998/Math/MathML":a||(a="http://www.w3.org/1999/xhtml"),s!=null){for(p=0;p<s.length;p++)if((f=s[p])&&"setAttribute"in f==!!T&&(T?f.localName==T:f.nodeType==3)){e=f,s[p]=null;break}}if(e==null){if(T==null)return document.createTextNode(w);e=document.createElementNS(a,T,w.is&&w),l&&(F.__m&&F.__m(n,s),l=!1),s=null}if(T==null)v===w||l&&e.data==w||(e.data=w);else{if(s=s&&Oe.call(e.childNodes),v=o.props||ve,!l&&s!=null)for(v={},p=0;p<e.attributes.length;p++)v[(f=e.attributes[p]).name]=f.value;for(p in v)if(f=v[p],p!="children"){if(p=="dangerouslySetInnerHTML")u=f;else if(!(p in w)){if(p=="value"&&"defaultValue"in w||p=="checked"&&"defaultChecked"in w)continue;Fe(e,p,null,f,a)}}for(p in w)f=w[p],p=="children"?g=f:p=="dangerouslySetInnerHTML"?c=f:p=="value"?m=f:p=="checked"?_=f:l&&typeof f!="function"||v[p]===f||Fe(e,p,f,v[p],a);if(c)l||u&&(c.__html==u.__html||c.__html==e.innerHTML)||(e.innerHTML=c.__html),n.__k=[];else if(u&&(e.innerHTML=""),Pt(n.type=="template"?e.content:e,Ne(g)?g:[g],n,o,r,T=="foreignObject"?"http://www.w3.org/1999/xhtml":a,s,i,s?s[0]:o.__k&&he(o,0),l,d),s!=null)for(p=s.length;p--;)et(s[p]);l||(p="value",T=="progress"&&m==null?e.removeAttribute("value"):m!=null&&(m!==e[p]||T=="progress"&&!m||T=="option"&&m!=v[p])&&Fe(e,p,m,v[p],a),p="checked",_!=null&&_!=e[p]&&Fe(e,p,_,v[p],a))}return e}function nt(e,n,o){try{if(typeof e=="function"){var r=typeof e.__u=="function";r&&e.__u(),r&&n==null||(e.__u=e(n))}else e.current=n}catch(a){F.__e(a,o)}}function Et(e,n,o){var r,a;if(F.unmount&&F.unmount(e),(r=e.ref)&&(r.current&&r.current!=e.__e||nt(r,null,n)),(r=e.__c)!=null){if(r.componentWillUnmount)try{r.componentWillUnmount()}catch(s){F.__e(s,n)}r.base=r.__P=null}if(r=e.__k)for(a=0;a<r.length;a++)r[a]&&Et(r[a],n,o||typeof e.type!="function");o||et(e.__e),e.__c=e.__=e.__e=void 0}function Gn(e,n,o){return this.constructor(e,o)}function Rt(e,n,o){var r,a,s,i;n==document&&(n=document.documentElement),F.__&&F.__(e,n),a=(r=typeof o=="function")?null:o&&o.__k||n.__k,s=[],i=[],tt(n,e=(!r&&o||n).__k=Wn(M,null,[e]),a||ve,ve,n.namespaceURI,!r&&o?[o]:a?null:n.firstChild?Oe.call(n.childNodes):null,s,!r&&o?o:a?a.__e:n.firstChild,r,i),At(s,e,i)}Oe=Tt.slice,F={__e:function(e,n,o,r){for(var a,s,i;n=n.__;)if((a=n.__c)&&!a.__)try{if((s=a.constructor)&&s.getDerivedStateFromError!=null&&(a.setState(s.getDerivedStateFromError(e)),i=a.__d),a.componentDidCatch!=null&&(a.componentDidCatch(e,r||{}),i=a.__d),i)return a.__E=a}catch(l){e=l}throw e}},St=0,zn=function(e){return e!=null&&e.constructor==null},Re.prototype.setState=function(e,n){var o;o=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=oe({},this.state),typeof e=="function"&&(e=e(oe({},o),this.props)),e&&oe(o,e),e!=null&&this.__v&&(n&&this._sb.push(n),vt(this))},Re.prototype.forceUpdate=function(e){this.__v&&(this.__e=!0,e&&this.__h.push(e),vt(this))},Re.prototype.render=M,le=[],_t=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,kt=function(e,n){return e.__v.__b-n.__v.__b},Ce.__r=0,Mt=/(PointerCapture)$|Capture$/i,Ze=0,Qe=xt(!1),Xe=xt(!0),Un=0;var Ie,O,ot,Ct,st=0,Ut=[],B=F,Ot=B.__b,Nt=B.__r,Dt=B.diffed,It=B.__c,Bt=B.unmount,Ht=B.__;function qt(e,n){B.__h&&B.__h(O,e,st||n),st=0;var o=O.__H||(O.__H={__:[],__h:[]});return e>=o.__.length&&o.__.push({}),o.__[e]}function b(e){return st=1,Yn(Wt,e)}function Yn(e,n,o){var r=qt(Ie++,2);if(r.t=e,!r.__c&&(r.__=[o?o(n):Wt(void 0,n),function(l){var d=r.__N?r.__N[0]:r.__[0],p=r.t(d,l);d!==p&&(r.__N=[p,r.__[1]],r.__c.setState({}))}],r.__c=O,!O.__f)){var a=function(l,d,p){if(!r.__c.__H)return!0;var c=r.__c.__H.__.filter(function(g){return!!g.__c});if(c.every(function(g){return!g.__N}))return!s||s.call(this,l,d,p);var u=r.__c.props!==l;return c.forEach(function(g){if(g.__N){var f=g.__[0];g.__=g.__N,g.__N=void 0,f!==g.__[0]&&(u=!0)}}),s&&s.call(this,l,d,p)||u};O.__f=!0;var s=O.shouldComponentUpdate,i=O.componentWillUpdate;O.componentWillUpdate=function(l,d,p){if(this.__e){var c=s;s=void 0,a(l,d,p),s=c}i&&i.call(this,l,d,p)},O.shouldComponentUpdate=a}return r.__N||r.__}function A(e,n){var o=qt(Ie++,3);!B.__s&&Jn(o.__H,n)&&(o.__=e,o.u=n,O.__H.__h.push(o))}function Qn(){for(var e;e=Ut.shift();)if(e.__P&&e.__H)try{e.__H.__h.forEach(De),e.__H.__h.forEach(rt),e.__H.__h=[]}catch(n){e.__H.__h=[],B.__e(n,e.__v)}}B.__b=function(e){O=null,Ot&&Ot(e)},B.__=function(e,n){e&&n.__k&&n.__k.__m&&(e.__m=n.__k.__m),Ht&&Ht(e,n)},B.__r=function(e){Nt&&Nt(e),Ie=0;var n=(O=e.__c).__H;n&&(ot===O?(n.__h=[],O.__h=[],n.__.forEach(function(o){o.__N&&(o.__=o.__N),o.u=o.__N=void 0})):(n.__h.forEach(De),n.__h.forEach(rt),n.__h=[],Ie=0)),ot=O},B.diffed=function(e){Dt&&Dt(e);var n=e.__c;n&&n.__H&&(n.__H.__h.length&&(Ut.push(n)!==1&&Ct===B.requestAnimationFrame||((Ct=B.requestAnimationFrame)||Xn)(Qn)),n.__H.__.forEach(function(o){o.u&&(o.__H=o.u),o.u=void 0})),ot=O=null},B.__c=function(e,n){n.some(function(o){try{o.__h.forEach(De),o.__h=o.__h.filter(function(r){return!r.__||rt(r)})}catch(r){n.some(function(a){a.__h&&(a.__h=[])}),n=[],B.__e(r,o.__v)}}),It&&It(e,n)},B.unmount=function(e){Bt&&Bt(e);var n,o=e.__c;o&&o.__H&&(o.__H.__.forEach(function(r){try{De(r)}catch(a){n=a}}),o.__H=void 0,n&&B.__e(n,o.__v))};var zt=typeof requestAnimationFrame=="function";function Xn(e){var n,o=function(){clearTimeout(r),zt&&cancelAnimationFrame(n),setTimeout(e)},r=setTimeout(o,35);zt&&(n=requestAnimationFrame(o))}function De(e){var n=O,o=e.__c;typeof o=="function"&&(e.__c=void 0,o()),O=n}function rt(e){var n=O;e.__c=e.__(),O=n}function Jn(e,n){return!e||e.length!==n.length||n.some(function(o,r){return o!==e[r]})}function Wt(e,n){return typeof n=="function"?n(e):n}function j(e,n=3){return e==null||!Number.isFinite(e)?"\\u2014":(e/1e9).toFixed(n)}function jt(e,n=3){let o=e/1e9;return`${o>0?"+":""}${o.toFixed(n)}`}function y(e,n=0,o=!1){if(e==null||!Number.isFinite(e))return"\\u2014";let r=e*100;return`${o&&r>0?"+":""}${r.toFixed(n)}%`}function se(e,n=0){return e==null||!Number.isFinite(e)?"\\u2014":e.toLocaleString(void 0,{maximumFractionDigits:n,minimumFractionDigits:n})}function ee(e,n){return Number.isFinite(e)?n>0?Zn(e*n):`${e>=100?e.toFixed(0):e.toFixed(1)} SOL`:"\\u2014"}function Zn(e){if(!Number.isFinite(e))return"\\u2014";let n=Math.abs(e);return n>=1e9?`$${(e/1e9).toFixed(2)}B`:n>=1e6?`$${(e/1e6).toFixed(n>=1e7?1:2)}M`:n>=1e3?`$${(e/1e3).toFixed(n>=1e5?0:1)}k`:`$${e.toFixed(0)}`}function ae(e){return Number.isFinite(e)?e<60?`${Math.max(0,Math.round(e))}s`:e<3600?`${Math.round(e/60)}m`:e<86400?`${(e/3600).toFixed(1)}h`:`${(e/86400).toFixed(1)}d`:"\\u2014"}function Q(e,n=Date.now()){return e?`${ae((n-e)/1e3)} ago`:"\\u2014"}function ce(e){return e?e.length>10?`${e.slice(0,4)}\\u2026${e.slice(-4)}`:e:"\\u2014"}function fe(e){return new Date(e).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}var Vt=e=>e>=75?"b3":e>=60?"b2":"b1";var N={demo:!1,moreTabs:[]};var ge={authed:null,settings:null,account:null,rows:[],health:null,funnelHour:null,funnelDay:null,signals:[],connected:!1,solUsd:0,lastUpdate:0,skew:0,toast:"",nav:null},it=new Set;function lt(){return ge}function V(e){ge={...ge,...e};for(let n of it)n()}function P(e){let[,n]=b(0);return A(()=>{let o=()=>n(r=>r+1);return it.add(o),()=>void it.delete(o)},[]),e(ge)}var at=null;function S(e){V({toast:e}),at&&clearTimeout(at),at=setTimeout(()=>V({toast:""}),3200)}function ue(e,n){V({nav:{tab:e,sub:n,at:Date.now()}})}var eo={async request(e,n){let o=await fetch(e,{method:n===void 0?"GET":"POST",credentials:"same-origin",headers:n===void 0?{accept:"application/json"}:{"content-type":"application/json","x-signal":"1"},body:n===void 0?void 0:JSON.stringify(n)});return{status:o.status,json:await o.json().catch(()=>({}))}},stream(e,n,o){let r=new EventSource("/api/stream");r.addEventListener("open",n),r.addEventListener("error",o);for(let a of["hello","radar","health","settings","signal","position"])r.addEventListener(a,s=>e(a,JSON.parse(s.data)));return()=>r.close()}},Kt=eo;async function k(e,n){let{status:o,json:r}=await Kt.request(e,n);if(o===401)throw V({authed:!1}),new Error("login required");if(o>=400)throw new Error(r?.error??`HTTP ${o}`);return r}async function q(){try{let e=await k("/api/state");V({authed:!0,settings:e.settings,account:e.account,health:e.health,funnelHour:e.funnel.hour,funnelDay:e.funnel.day,signals:e.signals,solUsd:e.solUsd||ge.solUsd,skew:Date.now()-e.serverTime,lastUpdate:Date.now()})}catch{}}var Be=null;function He(){Be?.(),Be=Kt.stream((e,n)=>{switch(e){case"hello":V({settings:n.settings,account:n.account,rows:n.rows,connected:!0,lastUpdate:Date.now(),skew:Date.now()-n.serverTime});break;case"radar":V({rows:n.rows,account:n.account,lastUpdate:Date.now(),connected:!0});break;case"health":V({health:n});break;case"settings":V({settings:n});break;case"signal":V({signals:[n,...ge.signals.filter(o=>o.id!==n.id)].slice(0,200)});break;case"position":{let{position:o,what:r}=n;r==="fill"&&o.fills?.length===1&&S(`Bought $${o.symbol||"coin"} \\xB7 score ${Math.round(o.signalScore)}`),r==="close"&&S(`Sold $${o.symbol||"coin"} \\xB7 ${o.exitReason} \\xB7 ${(o.pnlPct??0).toFixed(1)}%`);break}}},()=>V({connected:!0}),()=>V({connected:!1}))}function Gt(){Be?.(),Be=null}var to=0,ss=Array.isArray;function t(e,n,o,r,a,s){n||(n={});var i,l,d=n;if("ref"in d)for(l in d={},n)l=="ref"?i=n[l]:d[l]=n[l];var p={type:e,props:d,key:o,ref:i,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--to,__i:-1,__u:0,__source:a,__self:s};if(typeof e=="function"&&(i=e.defaultProps))for(l in i)d[l]===void 0&&(d[l]=i[l]);return F.vnode&&F.vnode(p),p}function ze({value:e,small:n}){return t("div",{class:`score ${Vt(e)}`,"aria-label":`score ${Math.round(e)}`,children:[Math.round(e),n&&t("small",{children:n})]})}function re({id:e,checked:n,onChange:o,label:r,disabled:a}){return t("label",{class:"switch",title:r,children:[t("input",{id:e,type:"checkbox",checked:n,disabled:a,"aria-label":r,onChange:s=>o(s.target.checked)}),t("span",{})]})}function E({label:e,help:n,children:o,htmlFor:r}){return t("div",{class:"field",children:[t("div",{class:"row",children:[t("label",{for:r,style:"flex:1",children:e}),t("div",{class:"ctrl",children:o})]}),n&&t("div",{class:"help",children:n})]})}function R({id:e,value:n,onChange:o,step:r=1,min:a,max:s,suffix:i,disabled:l}){return t("span",{class:"row",style:"gap:6px",children:[t("input",{id:e,class:"inp",type:"number",inputMode:"decimal",value:n,step:r,min:a,max:s,disabled:l,onInput:d=>{let p=Number(d.target.value);Number.isFinite(p)&&o(p)}}),i&&t("span",{class:"muted",children:i})]})}function we({k:e,v:n,s:o,tone:r}){return t("div",{class:"stat",children:[t("div",{class:"k",children:e}),t("div",{class:`v num ${r??""}`,children:n}),o!==void 0&&t("div",{class:"s",children:o})]})}function x({children:e,tone:n}){return t("span",{class:`tag ${n??""}`,children:e})}function Yt({points:e,height:n=64}){if(e.length<2)return t("div",{class:"empty",style:"padding:12px",children:"Equity line appears after the first closed trade."});let o=600,r=n,a=e.map(w=>w.t),s=e.map(w=>w.v),i=Math.min(...a),l=Math.max(...a),d=Math.min(...s),p=Math.max(...s),c=(p-d)*.1||Math.abs(p)*.01||1,u=w=>(w-i)/Math.max(1,l-i)*(o-8)+4,g=w=>r-4-(w-(d-c))/(p+c-(d-c))*(r-8),f=e.map((w,T)=>`${T?"L":"M"}${u(w.t).toFixed(1)},${g(w.v).toFixed(1)}`).join(" "),m=e[e.length-1],v=m.v>=e[0].v?"var(--good)":"var(--bad)";return t("svg",{class:"spark",viewBox:`0 0 ${o} ${r}`,preserveAspectRatio:"none",role:"img","aria-label":"equity over time",children:[t("line",{x1:"0",x2:o,y1:g(e[0].v),y2:g(e[0].v),stroke:"var(--line2)","stroke-dasharray":"3 4","stroke-width":"1"}),t("path",{d:`${f} L${u(m.t)},${r} L${u(e[0].t)},${r} Z`,fill:v,opacity:"0.12"}),t("path",{d:f,fill:"none",stroke:v,"stroke-width":"2","vector-effect":"non-scaling-stroke"}),t("circle",{cx:u(m.t),cy:g(m.v),r:"4",fill:v})]})}function Qt({bins:e,threshold:n}){let o=Math.max(1,...e);return t("div",{children:[t("div",{class:"hist",role:"img","aria-label":"score distribution",children:e.map((r,a)=>t("i",{class:a*10+10>n?"hot":"",style:{height:`${Math.max(3,r/o*100)}%`},title:`${a*10}\\u2013${a*10+9}: ${r}`},a))}),t("div",{class:"row faint",style:"justify-content:space-between;font-size:11px;margin-top:4px",children:[t("span",{children:"0"}),t("span",{children:"50"}),t("span",{children:"100"})]})]})}function D({children:e}){return t("div",{class:"empty",children:e})}var Xt={radar:t("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:[t("circle",{cx:"12",cy:"12",r:"9"}),t("circle",{cx:"12",cy:"12",r:"4.5"}),t("path",{d:"M12 12l6-6"})]}),trades:t("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:[t("path",{d:"M3 17l6-6 4 4 8-8"}),t("path",{d:"M14 7h7v7"})]}),bot:t("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:[t("rect",{x:"4",y:"7",width:"16",height:"12",rx:"3"}),t("path",{d:"M12 3v4M9 12h.01M15 12h.01M9 16h6"})]}),learn:t("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:t("path",{d:"M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6"})}),more:t("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:[t("circle",{cx:"5",cy:"12",r:"1.5"}),t("circle",{cx:"12",cy:"12",r:"1.5"}),t("circle",{cx:"19",cy:"12",r:"1.5"})]})};var xe={initialVirtualTok:1073e12,initialVirtualSol:3e10,initialRealTok:7931e11,supply:1e15},us=(()=>{let e=xe.initialVirtualSol*xe.initialVirtualTok,n=xe.initialVirtualTok-xe.initialRealTok;return e/n-xe.initialVirtualSol})();var Se=(e,n,o)=>e<n?n:e>o?o:e;var _e=[25,50,75,100,150,200,300,500],ke=[10,20,30,40,50,70],K=_e.flatMap(e=>ke.map(n=>({tp:e,sl:n})));var qe=[5,10,30,60,120],de=[50,55,60,65,70,75,80,85,90,95];var Ms=1+K.length,Ts=Float64Array.from(K,e=>1+e.tp/100),$s=Float64Array.from(K,e=>1-e.sl/100);var X=e=>`${(e*100).toFixed(e<.1?1:0)}%`,Me=e=>Math.abs(e)>=10?e.toFixed(0):e.toFixed(2),so=[{key:"age",label:"Age",x:e=>Math.log1p(e.ageSec),show:e=>We(e.ageSec),good:"young",bad:"old for its stage"},{key:"mcap",label:"Market cap",x:e=>Math.log(Math.max(e.mcapSol,1)),show:e=>`${e.mcapSol.toFixed(0)} SOL`,good:"room to run",bad:"already big"},{key:"progress",label:"Curve progress",x:e=>e.progress,show:e=>X(e.progress),good:"curve filling",bad:"curve nearly done"},{key:"net60",label:"Net inflow 60s",x:e=>Math.asinh(e.net60),show:e=>`${Me(e.net60)} SOL`,good:"buyers pouring in",bad:"net selling"},{key:"net300",label:"Net inflow 5m",x:e=>Math.asinh(e.net300),show:e=>`${Me(e.net300)} SOL`,good:"sustained demand",bad:"demand fading"},{key:"accel",label:"Acceleration",x:e=>Se((e.net60-e.netPrev60)/(Math.abs(e.netPrev60)+1),-3,3),show:e=>`${Me(e.net60-e.netPrev60)} SOL vs prior min`,good:"speeding up",bad:"slowing down"},{key:"buyRatio",label:"Buy share 60s",x:e=>(e.buys60+1)/(e.buys60+e.sells60+2),show:e=>`${e.buys60}B/${e.sells60}S`,good:"mostly buys",bad:"mostly sells"},{key:"uniq60",label:"New buyers 60s",x:e=>Math.log1p(e.uniq60),show:e=>`${e.uniq60}`,good:"many distinct buyers",bad:"few buyers"},{key:"uniqTotal",label:"Buyers total",x:e=>Math.log1p(e.uniqTotal),show:e=>`${e.uniqTotal}`,good:"broad participation",bad:"thin participation"},{key:"trades60",label:"Trades 60s",x:e=>Math.log1p(e.trades60),show:e=>`${e.trades60}`,good:"active",bad:"quiet"},{key:"avgBuy",label:"Avg buy 5m",x:e=>Math.log(.01+e.avgBuy300),show:e=>`${Me(e.avgBuy300)} SOL`,good:"retail-sized buys",bad:"whale-sized buys"},{key:"whale",label:"Largest buy share",x:e=>e.whale300,show:e=>X(e.whale300),good:"no single whale",bad:"one whale dominates"},{key:"devShare",label:"Dev holds",x:e=>e.devShare,show:e=>X(e.devShare),good:"dev holds little",bad:"dev holds a lot"},{key:"devSold",label:"Dev sold",x:e=>e.devSold,show:e=>X(e.devSold),good:"dev holding",bad:"dev dumping"},{key:"bundle",label:"Bundled supply",x:e=>e.bundleShare,show:e=>X(e.bundleShare),good:"no bundle",bad:"bundled at launch"},{key:"early",label:"Sniper supply",x:e=>e.earlyShare,show:e=>X(e.earlyShare),good:"snipers gone",bad:"snipers holding"},{key:"top10",label:"Top 10 holders",x:e=>e.top10,show:e=>X(e.top10),good:"spread out",bad:"concentrated"},{key:"holders",label:"Holders",x:e=>Math.log1p(e.holders),show:e=>`${e.holders}`,good:"many holders",bad:"few holders"},{key:"drawdown",label:"Below peak",x:e=>e.drawdown,show:e=>X(e.drawdown),good:"near highs",bad:"far below peak"},{key:"chg30",label:"Move 30s",x:e=>Se(e.chg30,-2,2),show:e=>X(Math.exp(e.chg30)-1),good:"rising",bad:"falling"},{key:"chg120",label:"Move 2m",x:e=>Se(e.chg120,-2,2),show:e=>X(Math.exp(e.chg120)-1),good:"trending up",bad:"trending down"},{key:"smart",label:"Smart wallets in",x:e=>Math.log1p(e.smartBuyers),show:e=>`${e.smartBuyers}`,good:"proven wallets buying",bad:""},{key:"fresh",label:"Fresh wallets",x:e=>Number.isFinite(e.freshShare)?e.freshShare:.3,show:e=>Number.isFinite(e.freshShare)?X(e.freshShare):"learning",good:"real wallets",bad:"brand-new wallets (alts)"},{key:"socials",label:"Socials",x:e=>e.socials/3,show:e=>`${e.socials}/3`,good:"has socials",bad:"no socials"},{key:"tweet",label:"Tweet-linked",x:e=>e.tweetLink,show:e=>e.tweetLink?"yes":"no",good:"anchored to a tweet",bad:""},{key:"cluster",label:"Narrative heat",x:e=>Math.log(Math.max(1,e.clusterSize)),show:e=>`${e.clusterSize} similar`,good:"hot narrative",bad:""},{key:"leader",label:"Narrative leader",x:e=>e.isLeader,show:e=>e.isLeader?"leads":"\\u2014",good:"leads its narrative",bad:""},{key:"copycat",label:"Copycat",x:e=>e.clusterSize>1&&!e.isLeader?1:0,show:e=>e.clusterSize>1&&!e.isLeader?"yes":"no",good:"",bad:"copy of a bigger coin"},{key:"serial",label:"Serial launcher",x:e=>Math.log1p(Math.max(0,e.creatorLaunches24h-1)),show:e=>`${e.creatorLaunches24h} launches/24h`,good:"",bad:"dev launches many coins"},{key:"creatorBest",label:"Dev track record",x:e=>Math.log1p(e.creatorBest/100),show:e=>`best ${e.creatorBest.toFixed(0)} SOL`,good:"dev had a winner",bad:""},{key:"heat",label:"Market heat",x:e=>e.heat,show:e=>Me(e.heat),good:"hot market",bad:"cold market"},{key:"hourSin",label:"Hour (sin)",x:e=>Math.sin(2*Math.PI*e.hourUtc/24),show:e=>`${e.hourUtc.toFixed(0)}h UTC`,good:"",bad:""},{key:"hourCos",label:"Hour (cos)",x:e=>Math.cos(2*Math.PI*e.hourUtc/24),show:e=>`${e.hourUtc.toFixed(0)}h UTC`,good:"",bad:""},{key:"liquidity",label:"Liquidity",x:e=>Math.log1p(e.liquiditySol),show:e=>`${e.liquiditySol.toFixed(1)} SOL`,good:"deep pool",bad:"thin pool"},{key:"sinceMig",label:"Since migration",x:e=>e.stage==="amm"?Math.log1p(e.sinceMigrateSec):0,show:e=>e.stage==="amm"?We(e.sinceMigrateSec):"\\u2014",good:"just graduated",bad:"stale after graduation"},{key:"dex",label:"DEX listing paid",x:e=>e.dexSignal,show:e=>`${e.dexSignal}/2`,good:"paid profile/boost",bad:""}],be=so.map(e=>e.key);function We(e){return e<90?`${Math.round(e)}s`:e<5400?`${Math.round(e/60)}m`:e<172800?`${(e/3600).toFixed(1)}h`:`${(e/86400).toFixed(1)}d`}var ie={age20:"20 s after launch",age45:"45 s after launch",age90:"90 s after launch",age180:"3 min after launch",age360:"6 min after launch",age720:"12 min after launch",prog25:"a quarter of the way to graduation",prog50:"halfway to graduation",prog75:"three quarters of the way to graduation",mig60:"1 min after graduating",mig300:"5 min after graduating",mig900:"15 min after graduating",mig3600:"1 h after graduating"};var Jt={age:[10,86400],mig:[30,86400]};function Zt(e){return e<120?Math.round(e):e<7200?Math.round(e/30)*30:Math.round(e/1800)*1800}function Ve(e){let n=/^(age|mig)(\\d{1,6})$/.exec(e);if(!n||e in ie)return null;let o=n[1],r=Number(n[2]),[a,s]=Jt[o];return r>=a&&r<=s&&Zt(r)===r?{kind:o,sec:r}:null}function en(e,n){let[o,r]=Jt[e];return`${e}${Zt(Math.min(r,Math.max(o,n)))}`}var ro=e=>e<120?`${e} s`:e<7200?`${+(e/60).toFixed(1)} min`:`${+(e/3600).toFixed(1)} h`;function te(e){let n=ie[e];if(n)return n;let o=Ve(e);return o?`${ro(o.sec)} after ${o.kind==="age"?"launch":"graduating"}`:e}var tn=["entryAt","conds","minScore","tpPct","slPct","maxHoldMin","trailPct","takeInitials","reentry","tradeCurve","tradeAmm","scoreOnly","filters"];function je(e){let n={};for(let o of tn)n[o]=o==="filters"?{...e.filters}:o==="conds"?(e.conds??[]).map(r=>({...r})):e[o];return n}function ct(e,n){return JSON.stringify(je(e))!==JSON.stringify(je(n))}function ut(e,n){let o={};for(let a of Object.keys(e))a!=="filters"&&(a==="conds"||a==="moments"?JSON.stringify(e[a])!==JSON.stringify(n[a]):e[a]!==n[a])&&(o[a]=e[a]);let r={};for(let a of Object.keys(e.filters))e.filters[a]!==n.filters[a]&&(r[a]=e.filters[a]);return Object.keys(r).length&&(o.filters=r),o}function nn(e,n,o){let r=ut(e,n);return{...o,...r,filters:{...o.filters,...r.filters??{}}}}var pe=[0,10,30,60],lo=K.length*pe.length,J=e=>e.f,an=[{key:"any",label:"any coin",test:()=>!0},{key:"curve",label:"still on the bonding curve",test:e=>e.stage==="curve",stage:"curve"},{key:"amm",label:"already graduated",test:e=>e.stage==="amm",stage:"amm"},...[40,80,150].map(e=>({key:`mcap<=${e}`,label:`market cap \\u2264 ${e} SOL`,test:n=>J(n).mcap<=e,filters:{maxMcapSol:e}})),...[80,150,300].map(e=>({key:`mcap>=${e}`,label:`market cap \\u2265 ${e} SOL`,test:n=>J(n).mcap>=e,filters:{minMcapSol:e}})),...[1,3,10].map(e=>({key:`age<=${e}m`,label:`younger than ${e} min`,test:n=>J(n).age<=e*60,filters:{maxAgeMin:e}})),...[3,10].map(e=>({key:`age>=${e}m`,label:`older than ${e} min`,test:n=>J(n).age>=e*60,filters:{minAgeSec:e*60}})),{key:"bundle<=10",label:"\\u2264 10% bundled at launch",test:e=>J(e).bundle*100<=10,filters:{maxBundlePct:10}},{key:"top10<=30",label:"top 10 holders own \\u2264 30%",test:e=>J(e).top10*100<=30,filters:{maxTop10Pct:30}},...[30,100].map(e=>({key:`buyers>=${e}`,label:`${e}+ buyers`,test:n=>J(n).buyers>=e,filters:{minBuyers:e}})),{key:"socials",label:"has socials",test:e=>J(e).socials>0,filters:{requireSocials:!0}},{key:"dev<=5",label:"dev holds \\u2264 5%",test:e=>J(e).devShare*100<=5,filters:{maxDevPct:5}},{key:"devheld",label:"dev hasn\'t sold",test:e=>J(e).devSold<=0,filters:{maxDevSoldPct:0}},{key:"onelaunch",label:"dev\'s only launch today",test:e=>J(e).launches24h<=1,filters:{maxDevLaunches24h:1}}];var Ks={horizonMs:6*36e5,minHours:24,minSamples:1e3,minDiscovery:80,minHoldout:40,candidates:20,minWins:10,placeboRuns:3,seed:7};function ln(e,n){return e.entryAt==="score"&&!de.includes(e.minScore)?`score ${e.minScore} is not one of the levels the bot records (${de.join(", ")})`:e.entryAt==="score"&&e.reentry?"buying the same coin again is not recorded":K.some(o=>o.tp===e.tpPct&&o.sl===e.slPct)?po(e,n)===null?`a time limit of ${e.maxHoldMin} min is not among the ones the bot records (${qe.join(", ")} min, ${Math.round(n/36e5)} h or none)`:e.trailPct>0?"a trailing stop is not recorded":e.takeInitials?"taking the initials out is not recorded":null:`+${e.tpPct}% / \\u2212${e.slPct}% is not among the exits the bot records (take profit ${co}; stop loss ${uo})`}var co=[...new Set(K.map(e=>e.tp))].map(e=>`${e}%`).join(", "),uo=[...new Set(K.map(e=>e.sl))].map(e=>`${e}%`).join(", ");function po(e,n){return e.maxHoldMin===0||e.maxHoldMin*6e4>=n?0:qe.includes(e.maxHoldMin)?e.maxHoldMin:null}var dt=864e5,nr=be.length,mo=pe.length,$e={maxActive:20,mineMax:5,newPerRun:3,looks:[60,120,240,480],alpha:5e-4,minWins:10,maxAgeMs:7*dt,provenMs:14*dt,postMin:40,minSeen:60,minHours:24,minRows:1e3,quantiles:[.1,.25,.5,.75,.9],screenTop:16,pairTop:8,retryAfterMs:3*dt,keepRetired:30,keepVals:3e3};var ye=e=>e===0||!Number.isFinite(e)?0:Number(e.toPrecision(2)),ho=e=>`${e>=0?"+":""}${Math.round(e*100)}%`,ne=(e,n)=>({key:e,label:n,raw:o=>o,x:o=>o,nice:o=>Math.round(o*100)/100,show:o=>`${Math.round(o*100)}%`,pct:!0}),Te=(e,n)=>({key:e,label:n,raw:Math.expm1,x:o=>Math.log1p(Math.max(0,o)),nice:o=>o>=10?ye(o):Math.round(o),show:o=>`${Math.round(o)}`}),cn=(e,n)=>({key:e,label:n,raw:Math.sinh,x:Math.asinh,nice:ye,show:o=>`${o} SOL`}),un=(e,n)=>({key:e,label:n,raw:o=>Math.exp(o)-1,x:o=>Math.max(-2,Math.min(2,Math.log(1+Math.max(-.99,o)))),nice:o=>Math.round(o*100)/100,show:ho,pct:!0}),pt=(e,n)=>({key:e,label:n,raw:o=>o,x:o=>o,nice:o=>o>=.5?1:0,show:o=>o>=.5?"yes":"no",yesNo:!0}),Pe=[{key:"age",label:"Age",raw:Math.expm1,x:e=>Math.log1p(Math.max(0,e)),nice:e=>e<90?Math.round(e/5)*5:e<5400?Math.round(e/60)*60:Math.round(e/600)*600,show:We},{key:"mcap",label:"Market cap",raw:Math.exp,x:e=>Math.log(Math.max(e,1)),nice:ye,show:e=>`${e} SOL`},ne("progress","Curve progress"),cn("net60","Net inflow 60s"),cn("net300","Net inflow 5m"),{key:"accel",label:"Acceleration",raw:e=>e,x:e=>e,nice:e=>Math.round(e*10)/10,show:e=>e.toFixed(1)},ne("buyRatio","Buy share 60s"),Te("uniq60","New buyers 60s"),Te("uniqTotal","Buyers total"),Te("trades60","Trades 60s"),{key:"avgBuy",label:"Avg buy 5m",raw:e=>Math.exp(e)-.01,x:e=>Math.log(.01+Math.max(0,e)),nice:ye,show:e=>`${e} SOL`},ne("whale","Largest buy share"),ne("devShare","Dev holds"),ne("devSold","Dev sold"),ne("bundle","Bundled supply"),ne("early","Sniper supply"),ne("top10","Top 10 holders"),Te("holders","Holders"),ne("drawdown","Below peak"),un("chg30","Move 30s"),un("chg120","Move 2m"),Te("smart","Smart wallets in"),ne("fresh","Fresh wallets"),{key:"socials",label:"Socials",raw:e=>e*3,x:e=>e/3,nice:e=>Math.round(e),show:e=>`${Math.round(e)} of 3`},pt("tweet","Tweet-linked"),{key:"cluster",label:"Narrative heat",raw:Math.exp,x:e=>Math.log(Math.max(1,e)),nice:e=>Math.round(e),show:e=>`${Math.round(e)} similar coins`},pt("leader","Narrative leader"),pt("copycat","Copycat"),{key:"serial",label:"Dev launches in 24 h",raw:e=>Math.expm1(e)+1,x:e=>Math.log1p(Math.max(0,e-1)),nice:e=>Math.round(e),show:e=>`${Math.round(e)}`},{key:"creatorBest",label:"Dev\'s best coin",raw:e=>Math.expm1(e)*100,x:e=>Math.log1p(Math.max(0,e)/100),nice:ye,show:e=>`${e} SOL`},{key:"heat",label:"Market heat",raw:e=>e,x:e=>e,nice:e=>Math.round(e*100)/100,show:e=>e.toFixed(2)},{key:"liquidity",label:"Liquidity",raw:Math.expm1,x:e=>Math.log1p(Math.max(0,e)),nice:ye,show:e=>`${e} SOL`},{key:"dex",label:"DEX listing paid",raw:e=>e,x:e=>e,nice:e=>Math.round(e),show:e=>`${Math.round(e)} of 2`}],fo=new Map(Pe.map(e=>[e.key,e])),or=Pe.map(e=>be.indexOf(e.key));function dn(e){let n=fo.get(e.k);if(!n)return e.k;let o=n.raw(e.v);return n.yesNo?e.op===">="?n.label.toLowerCase():`not ${n.label.toLowerCase()}`:`${n.label.toLowerCase()} ${e.op===">="?"\\u2265":"\\u2264"} ${n.show(o)}`}var go=[...new Set(K.map(e=>e.tp))],bo=[...new Set(K.map(e=>e.sl))],sr=`entry, then up to 3 conditions, then the exit \\u2014 e.g. "mig300 top10<=25% smart>=1 tp100 sl30 hold30". Entry: score50\\u2026score95 (the first time the score reaches it) or ${Object.keys(ie).join(", ")}. Optional: stage=curve or stage=amm. Conditions on: ${Pe.map(e=>e.key).join(", ")} (with >= or <=; % for shares; =1 / =0 for yes/no). Take profit tp: ${go.join(", ")}; stop loss sl: ${bo.join(", ")}; time limit hold (minutes): ${pe.filter(e=>e>0).join(", ")}, or none.`;var rr=1-2*$e.alpha;var ar=[[25,10,0],[50,20,0],[50,20,10],[100,30,0],[100,30,30],[100,50,0],[200,50,0],[150,40,60],[300,70,0],[500,50,0]].map(([e,n,o])=>K.findIndex(r=>r.tp===e&&r.sl===n)*mo+pe.indexOf(o)).filter(e=>e>=0);var pn={entryAt:"score",conds:[],trailPct:0,takeInitials:!1,reentry:!1,tradeCurve:!0,tradeAmm:!0,scoreOnly:!0},yo=[{key:"plan",name:"Your plan",note:"Buy when a coin reaches 75 \\xB7 sell at 2\\xD7 or \\u221250% \\xB7 time limit 4 hours. Score only.",proof:"yours",settings:{...pn,minScore:75,tpPct:100,slPct:50,maxHoldMin:240}},{key:"sim-momentum",name:"Simulator finding: fast momentum",note:"Buy when a coin reaches 95 \\xB7 sell at +500% or \\u221220%, or after 10 minutes. It won in the simulator, which has more momentum than pump.fun \\u2014 paper-test it before trusting it.",proof:"unproven",settings:{...pn,minScore:95,tpPct:500,slPct:20,maxHoldMin:10}}];function Ke(e,n){for(let[o,r]of Object.entries(n))if(o==="filters"){for(let[a,s]of Object.entries(r))if(e.filters[a]!==s)return!1}else if(o==="conds"){if(JSON.stringify(e.conds??[])!==JSON.stringify(r??[]))return!1}else if(e[o]!==r)return!1;return!0}function Le(e){let n=e.maxHoldMin>0?e.maxHoldMin>=120&&e.maxHoldMin%60===0?`${e.maxHoldMin/60} h`:`${e.maxHoldMin} min`:"no time limit",o=e.entryAt&&e.entryAt!=="score"?te(e.entryAt):`score \\u2265 ${e.minScore}`,r=e.conds?.length?` \\xB7 ${e.conds.map(dn).join(", ")}`:"";return`${o}${r} \\xB7 +${e.tpPct}% / \\u2212${e.slPct}% \\xB7 ${n}`}var vo=e=>`${e>=0?"+":""}${(e*100).toFixed(1)}%`;function mn(e){let n=e?.survivors?.slice(0,3)??[];return[...yo,...n.map(o=>({key:`edge:${o.text}`,name:"Found in your data",note:`${o.text}. ${vo(o.holdout.mean)} per trade on ${o.holdout.n} trades the search never saw.`,proof:"data",settings:o.settings}))]}function fn({settings:e}){let[n,o]=b(void 0),[r,a]=b(!1),[s,i]=b(!1),[l,d]=b(null),p=()=>k("/api/autopilot").then(f=>o(f.view)).catch(()=>o(null));A(()=>{p();let f=setInterval(p,6e4);return()=>clearInterval(f)},[e.autopilot,e.mode,e.minScore,e.entryAt,e.tpPct,e.slPct,e.maxHoldMin]),A(()=>{if(!n?.own||!("measuring"in n.own))return;let f=setTimeout(p,4e3);return()=>clearTimeout(f)},[n]);let c=e.mode==="live",u=async(f,m)=>{if(c&&l!==m){d(m);return}i(!0);try{await k("/api/settings",f.settings),d(null),S(e.autopilot?"Using it. The autopilot stays on: it keeps this rule unless a proven rule does clearly better.":e.enabled?"Using it for new trades.":"Rule set. Switch Auto-trading on to start."),q(),p()}catch(_){S(String(_.message))}finally{i(!1)}},g=async f=>{if(f&&c&&!r){a(!0);return}i(!0);try{await k("/api/settings",{autopilot:f}),a(!1),S(f?"Autopilot on \\u2014 it trades the best proven rule":"Autopilot off \\u2014 the rule stays as it is"),q(),p()}catch(m){S(String(m.message))}finally{i(!1)}};return n===null?null:t("div",{class:`card ${e.autopilot?"autopilot-on":""}`,style:"margin-top:12px",children:[t("div",{class:"row",style:"align-items:flex-start",children:[t(re,{id:"autopilot",checked:e.autopilot,label:"Autopilot",disabled:s,onChange:g}),t("div",{style:"flex:1",children:[t("div",{style:"font-weight:760;font-size:16px",children:e.autopilot?"Autopilot is on":"Autopilot is off"}),t("div",{class:"muted",style:"font-size:13px",children:"Trades the best rule the edge finder proved on data it never saw, switches as soon as a clearly better one is proven, and drops a rule that stops working in practice. A rule you pick yourself competes too: it stays unless a proven rule does clearly better. It changes the rule only \\u2014 never your trade size, limits or mode."})]}),t(x,{tone:e.autopilot?"good":void 0,children:e.autopilot?"ON":"OFF"})]}),r&&t("div",{class:"note",style:"margin-top:10px",children:[t("b",{children:"You are trading real money."})," With real money the autopilot only uses rules proven at the go-live bar and otherwise holds new entries."," ",t("button",{class:"btn sm danger",disabled:s,onClick:()=>g(!0),children:"Turn on \\u2014 real money"})]}),n&&(e.autopilot||n.log.length>0)&&t(wo,{v:n,on:e.autopilot,use:u,busy:s,confirmRule:l}),!e.autopilot&&t("p",{class:"faint note",children:"Off: the bot trades the rule set below. Turning it on lets it pick the best proven rule by itself \\u2014 your own rule competes with them."})]})}function hn({r:e,id:n,use:o,busy:r,confirmRule:a}){return e.inUse?t(x,{tone:"flare",children:"in use"}):t("button",{class:`btn sm ${a===n?"danger":""}`,disabled:r,onClick:()=>o(e,n),title:e.text,children:a===n?"Tap again \\u2014 real money":"Use this rule"})}function wo({v:e,on:n,use:o,busy:r,confirmRule:a}){let s=e.own;return t("div",{style:"margin-top:10px",children:[n?e.holding?t("div",{class:"entrymoment warn",children:["\\u23F8 ",t("b",{children:"New live entries wait:"})," ",e.holdReason,". Open positions are still managed."]}):e.active&&e.proof?t("div",{class:"entrymoment good",children:[t("b",{children:"Trading:"})," ",e.active,t("div",{style:"font-size:12.5px;margin-top:2px",children:["Since ",Q(e.since)," \\xB7 it showed ",y(e.proof.mean,1,!0)," per trade on ",e.proof.n," trades the search never saw (worst case ",y(e.proof.lo,1,!0),").",e.forward?` On the ${e.forward.n} coins that qualified since: ${y(e.forward.mean,1,!0)} per trade.`:" Judged on its own trades and on the coins that qualify after it, as they finish.",!e.relisted&&e.reportAt>e.since&&" The last search did not list it again \\u2014 that alone is not evidence against it, so it stays until its results say otherwise."]})]}):t("div",{class:"entrymoment",children:[t("b",{children:"On your own rule"})," (",e.rule,") \\u2014 a proven rule replaces it only when it does clearly better",e.reportAt?` \\xB7 last search ${Q(e.reportAt)}`:"",".",t("div",{style:"font-size:12.5px;margin-top:2px",children:s?"measuring"in s?"Measuring your rule on the recordings\\u2026":"why"in s?`Nothing to weigh it by yet: ${s.why}. Until then any proven rule replaces it; its own trades count once it has 30.`:s.from==="trades"?`Weighed by its own ${s.n} trades: ${y(s.mean,1,!0)} each (at least ${y(s.lo,1,!0)}), ~${s.perDay.toFixed(0)} a day \\u2014 at least ~${s.worstSolPerDay.toFixed(2)} SOL a day at your size.`:`Weighed on the newest recordings, the part the search checks its candidates on: ${y(s.mean,1,!0)} per trade on ${s.n} coins (at least ${y(s.lo,1,!0)}), ~${s.perDay.toFixed(0)} trades a day at your limits \\u2014 at least ~${s.worstSolPerDay.toFixed(2)} SOL a day at your size.`:null})]}):null,n&&e.ranking.length>0&&t("details",{class:"more",children:[t("summary",{children:["Proven rules, best first (",e.ranking.length,")"]}),t("p",{class:"faint",style:"font-size:12.5px;margin:0 0 6px",children:["Ranked by what each would earn per day at your size and limits, counted from its worst case on unseen data.",!e.trusted&&" The last search is not used right now: it is too old, was made by an older version of the bot, or its luck check found rules on shuffled data."]}),e.ranking.map(i=>t("div",{class:"edge",children:[t("div",{class:"row wrap",style:"gap:6px",children:[t("span",{class:"edge-rule",style:"flex:1;min-width:0",children:i.text}),e.live&&(i.liveGrade?t(x,{tone:"good",children:"real-money grade"}):t(x,{children:"paper only"})),i.benchedUntil>Date.now()&&t(x,{tone:"bad",children:"benched"}),t(hn,{r:i,id:`rank:${i.text}`,use:o,busy:r,confirmRule:a})]}),t("div",{class:"num faint",style:"font-size:12.5px",children:["worst case ~",i.worstSolPerDay.toFixed(2)," SOL/day \\xB7 ",y(i.perTrade,1,!0)," per trade (worst ",y(i.worstPerTrade,1,!0),") \\xB7 ",i.unseenTrades," unseen trades \\xB7 ~",i.tradesPerDay.toFixed(0)," trades/day your limits allow"]})]},i.text))]}),e.log.length>0&&t("details",{class:"more",children:[t("summary",{children:["Decisions (",e.log.length,")"]}),t("p",{class:"faint",style:"font-size:12.5px;margin:0 0 6px",children:["One click puts a rule back in use.",n?" The autopilot stays on: it keeps your pick unless a proven rule does clearly better.":""," The numbers in a decision are what was known then."]}),e.log.map(i=>t("div",{class:"edge",children:[t("div",{class:"faint",style:"font-size:12px",children:new Date(i.at).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}),t("div",{style:"font-size:13px",children:i.what}),i.rules.map((l,d)=>t("div",{class:"row wrap",style:"gap:6px;margin-top:4px",children:[i.rules.length>1&&t("span",{class:"faint",style:"font-size:12.5px;flex:1;min-width:0",children:l.text}),t(hn,{r:l,id:`log:${i.at}:${d}`,use:o,busy:r,confirmRule:a})]},d))]},i.at+i.what))]})]})}var gn={ok:"good",info:void 0,warn:"warn",fail:"bad"},xo={ok:"\\u2713",info:"i",warn:"!",fail:"\\u2715"};function bn(){let[e,n]=b(void 0),[o,r]=b(""),[a,s]=b(!1),i=async()=>{s(!0);try{let c=await k("/api/diagnosis");try{await navigator.clipboard.writeText(c.text),r(""),S("Copied. Paste it into your chat with Claude.")}catch{r(c.text)}}catch(c){S(String(c.message))}finally{s(!1)}};if(A(()=>{let c=()=>k("/api/checks").then(g=>n(g.view)).catch(()=>n(null));c();let u=setInterval(c,6e4);return()=>clearInterval(u)},[]),!e)return null;let l={fail:0,warn:1,info:2,ok:3},d=[...e.checks].sort((c,u)=>l[c.status]-l[u.status]),p=d[0]?.status??"ok";return t("div",{class:"card",style:"margin-top:12px",children:[t("div",{class:"row",style:"align-items:flex-start",children:[t("div",{style:"flex:1",children:[t("h2",{style:"margin-bottom:2px",children:"Self-check"}),t("div",{class:"muted",style:"font-size:13px",children:"The bot watching itself: do its recordings match its real trades, does the rule in use keep its promise, are its decisions steady, does it see what it records. Anything that turns bad is sent to Telegram at once, and once a day a check-up."})]}),t(x,{tone:gn[p],children:e.checks.length?e.summary.replace(/^\\S+\\s/,""):"not run yet"})]}),d.map(c=>t("div",{class:"edge",children:t("div",{class:"row",style:"gap:8px;align-items:flex-start",children:[t(x,{tone:gn[c.status],children:xo[c.status]}),t("div",{style:"flex:1;min-width:0",children:[t("b",{style:"font-size:13.5px",children:c.title}),t("div",{class:"faint",style:"font-size:12.5px",children:c.detail})]})]})},c.key)),e.at>0&&t("p",{class:"faint note",children:["Checked ",Q(e.at)," \\xB7 every 10 minutes, and in full every 2 hours. Telegram: /checks"]}),t("div",{class:"row wrap",style:"gap:8px;margin-top:8px",children:[t("button",{class:"btn sm",disabled:a,onClick:i,children:a?"Preparing\\u2026":"Copy a diagnosis for Claude"}),t("span",{class:"faint",style:"font-size:12.5px",children:"Everything the bot sees in one page \\u2014 its data, the search\'s closest tries, how your rule does \\u2014 to paste into a chat. No keys or wallet in it."})]}),o&&t("textarea",{class:"inp wide",readOnly:!0,rows:10,value:o,onFocus:c=>c.target.select(),"aria-label":"diagnosis"})]})}var Z=null;function vn(){let e=P(h=>h.settings),n=P(h=>h.funnelHour),o=P(h=>h.funnelDay),r=P(h=>h.health),a=P(h=>h.account),[s,i]=b(Z?.draft??e),[l,d]=b(Z!==null),[p,c]=b(!1),[u,g]=b(!1);if(A(()=>{if(!e)return;if(!Z){i(e);return}let h=nn(Z.draft,Z.base,e);Z={draft:h,base:e},i(h)},[e]),A(()=>{if(!l)return;let h=H=>{H.preventDefault(),H.returnValue=""};return window.addEventListener("beforeunload",h),()=>window.removeEventListener("beforeunload",h)},[l]),!s||!e)return null;let f=h=>{Z={draft:h,base:Z?.base??e},i(h),d(!0)},m=(h,H)=>f({...s,[h]:H}),_=(h,H)=>f({...s,filters:{...s.filters,[h]:H}}),v=()=>{Z=null,i(e),d(!1)},w=async h=>{c(!0);try{let H=h??ut(s,Z?.base??e),Y=await k("/api/settings",H);h||(Z=null,i(Y.settings),d(!1));let I=e.autopilot&&Y.settings.autopilot&&ct(e,Y.settings)?" \\xB7 The autopilot stays on: it keeps your rule unless a proven rule does clearly better":"";S(`${h?"Updated":"Saved \\u2014 applies to new trades"}${I}`),q()}catch(H){S(String(H.message))}finally{c(!1)}},T=!!r?.live&&!r.live.halted,U=o?.scored??0,W=o?.coinsAbove?.[Math.round(s.minScore)]??0,G=U>0?W/U:NaN,z=Math.max(1/6,Math.min(o?.hours??1,(r?.uptimeSec??3600)/3600)),C=U>0?W/z:NaN;return t("div",{children:[t("div",{class:`bigswitch ${e.enabled?"on":""}`,children:[t(re,{id:"enabled",checked:e.enabled,label:"Auto-trading",onChange:h=>w({enabled:h})}),t("div",{style:"flex:1",children:[t("div",{style:"font-weight:760;font-size:16px",children:e.enabled?"Auto-trading is ON":"Auto-trading is paused"}),t("div",{class:"muted",style:"font-size:13px",children:e.enabled?`${Le(e)}${e.scoreOnly?" \\xB7 score only":" \\xB7 with filters"} \\xB7 ${e.mode==="live"?"LIVE money":"paper"} \\xB7 ${N.demo?"demo: runs while this page is open (the real bot runs on a server 24/7)":"runs on the server even with this page closed"}`:"The radar keeps scoring; no new trades. Open positions are still managed."})]}),t(x,{tone:e.mode==="live"?"bad":"flare",children:e.mode==="live"?"LIVE":"PAPER"})]}),t(fn,{settings:e}),t(bn,{}),t(_o,{settings:e,onApplied:()=>void q()}),t("div",{class:"grid two",style:"margin-top:12px",children:[t("div",{class:"card",children:[t("h2",{children:"Entry"}),t(ko,{draft:s,saved:e,edit:f}),s.entryAt==="score"&&t(M,{children:[t(E,{label:`Minimum score: ${s.minScore}`,htmlFor:"minScore",help:t(M,{children:[Number.isFinite(G)?t(M,{children:["Recently ",t("b",{children:C.toFixed(1)})," coins/hour reached this (",(G*100).toFixed(1),"% of scored coins) \\u2014 that is roughly how many chances to buy you get."]}):"Collecting data on how often coins reach each score\\u2026"," ","50 is a typical coin moment and 75 the top 5% (the score keeps that meaning when it learns): higher means better odds."]}),children:t("span",{})}),t("input",{id:"minScore",type:"range",min:0,max:100,step:1,value:s.minScore,onInput:h=>m("minScore",Number(h.target.value)),style:"width:100%","aria-label":"minimum score"})]}),t("div",{class:"field",style:s.scoreOnly?"background:var(--flare-soft);border-radius:10px;padding:12px;margin:8px 0;border:0":"",children:[t("div",{class:"row",children:[t("label",{for:"scoreOnly",style:"flex:1;font-weight:700",children:s.entryAt==="score"?"Score only":"No filters"}),t(re,{id:"scoreOnly",checked:s.scoreOnly,label:s.entryAt==="score"?"Score only":"No filters",onChange:h=>m("scoreOnly",h)})]}),t("div",{class:"help",children:[s.entryAt==="score"?"When on, the bot buys on the score alone and ignores every filter below.":"When on, the bot buys every coin at this moment and ignores every filter below."," Your budget limits still apply (size, max open positions, daily loss, one entry per coin) \\u2014 they protect the wallet, they don\'t judge the coin."]})]}),t(E,{label:"Take profit",htmlFor:"tp",help:"Net of all fees and slippage. 100 = sell at 2\\xD7.",children:t(R,{id:"tp",value:s.tpPct,onChange:h=>m("tpPct",h),min:1,suffix:"%"})}),t(E,{label:"Stop loss",htmlFor:"sl",help:"From your entry cost, fixed (not trailing). In a crash the fill can land below this \\u2014 the bot always sells.",children:t(R,{id:"sl",value:s.slPct,onChange:h=>m("slPct",h),min:1,max:99,suffix:"%"})}),t(E,{label:"Sell after",htmlFor:"hold",help:"Time limit for each trade: sells at market if neither the target nor the stop was hit by then. 0 = no limit. The recordings keep 5, 10, 30, 60 and 120 min and 6 h (360), so a rule with one of these can be weighed on them.",children:t(R,{id:"hold",value:s.maxHoldMin,onChange:h=>m("maxHoldMin",h),min:0,suffix:"min"})}),t(E,{label:"Size per trade",htmlFor:"size",help:e.mode==="live"&&r?.live?`Server cap: ${r.live.maxPositionSol} SOL per live trade.`:"Fees included.",children:t(R,{id:"size",value:s.positionSol,onChange:h=>m("positionSol",h),step:.01,min:.001,suffix:"SOL"})}),t(E,{label:"Max open positions",htmlFor:"maxOpen",children:t(R,{id:"maxOpen",value:s.maxOpen,onChange:h=>m("maxOpen",h),min:1,max:50})}),t(E,{label:"Trade stage",help:"Bonding curve = before graduation (fast, cheap entry). Graduated = PumpSwap after migration.",children:t("div",{class:"chips",children:[t("button",{class:"chip","aria-pressed":s.tradeCurve,onClick:()=>m("tradeCurve",!s.tradeCurve),children:"Curve"}),t("button",{class:"chip","aria-pressed":s.tradeAmm,onClick:()=>m("tradeAmm",!s.tradeAmm),children:"Graduated"})]})}),t("div",{class:"row",style:"margin-top:12px;gap:8px",children:[t("button",{class:"btn primary",disabled:!l||p,onClick:()=>w(),children:p?"Saving\\u2026":l?"Save settings":"Saved"}),l&&t("button",{class:"btn ghost",onClick:v,children:"Discard"})]}),e.autopilot&&t(To,{draft:s}),t("p",{class:"faint",style:"font-size:12px;margin:10px 0 0",children:"Open positions keep the exit settings they were bought with."})]}),t(So,{funnel:n,threshold:e.minScore,scoreOnly:e.scoreOnly,enabled:e.enabled,open:a?.open.length??0,maxOpen:e.maxOpen})]}),t("div",{class:"card",style:"margin-top:12px",children:[t("h2",{children:["Filters ",s.scoreOnly&&t(x,{tone:"flare",children:"ignored \\u2014 score only is on"})]}),t("fieldset",{disabled:s.scoreOnly,style:"border:0;padding:0;margin:0;opacity:1",children:t("div",{style:s.scoreOnly?"opacity:.45":"",children:[t(E,{label:"Max dev holding",htmlFor:"fDev",children:t(R,{id:"fDev",value:s.filters.maxDevPct,onChange:h=>_("maxDevPct",h),suffix:"%"})}),t(E,{label:"Max top-10 holders",htmlFor:"fTop",children:t(R,{id:"fTop",value:s.filters.maxTop10Pct,onChange:h=>_("maxTop10Pct",h),suffix:"%"})}),t(E,{label:"Max launch bundle",htmlFor:"fBundle",help:"Supply bought by other wallets in the launch block.",children:t(R,{id:"fBundle",value:s.filters.maxBundlePct,onChange:h=>_("maxBundlePct",h),suffix:"%"})}),t(E,{label:"Min distinct buyers",htmlFor:"fBuyers",children:t(R,{id:"fBuyers",value:s.filters.minBuyers,onChange:h=>_("minBuyers",h)})}),t(E,{label:"Market cap window",help:"SOL, 0 = no limit",children:t("span",{class:"row",style:"gap:6px",children:[t(R,{id:"fMin",value:s.filters.minMcapSol,onChange:h=>_("minMcapSol",h)}),t("span",{class:"faint",children:"to"}),t(R,{id:"fMax",value:s.filters.maxMcapSol,onChange:h=>_("maxMcapSol",h)})]})}),t(E,{label:"Skip serial launchers",htmlFor:"fSerial",help:"Devs with more than this many launches in 24h (0 = off).",children:t(R,{id:"fSerial",value:s.filters.maxDevLaunches24h,onChange:h=>_("maxDevLaunches24h",h)})}),t(E,{label:"Skip if dev sold more than",htmlFor:"fDevSold",help:"100 = off",children:t(R,{id:"fDevSold",value:s.filters.maxDevSoldPct,onChange:h=>_("maxDevSoldPct",h),suffix:"%"})}),t(E,{label:"Require socials",htmlFor:"fSocial",children:t(re,{id:"fSocial",checked:s.filters.requireSocials,label:"Require socials",onChange:h=>_("requireSocials",h)})})]})}),t("details",{class:"more",children:[t("summary",{children:"Advanced execution"}),t(E,{label:"Entry slippage",htmlFor:"slip",help:"How far the price may move before your buy lands. Too tight = missed entries on fast coins; the bot retries while the score holds.",children:t(R,{id:"slip",value:s.slippagePct,onChange:h=>m("slippagePct",h),suffix:"%"})}),t(E,{label:"Keep retrying a missed entry for",htmlFor:"retry",children:t(R,{id:"retry",value:s.retryWindowSec,onChange:h=>m("retryWindowSec",h),suffix:"s"})}),t(E,{label:"Score must hold for",htmlFor:"confirm",help:"Evaluations in a row at or above your score before buying \\u2014 about one per second while the coin trades. 5 skips one-off spikes and costs a few seconds; 1 buys on the first.",children:t(R,{id:"confirm",value:s.confirmTicks,onChange:h=>m("confirmTicks",h),min:1,max:20})}),t(E,{label:"Exit slippage (starts at)",htmlFor:"xslip",help:"Escalates automatically on retries \\u2014 exits always go through.",children:t(R,{id:"xslip",value:s.exitSlippagePct,onChange:h=>m("exitSlippagePct",h),suffix:"%"})}),t(E,{label:"Sell a coin that went quiet after",htmlFor:"stale",help:"No trades for this long frees the slot (0 = never).",children:t(R,{id:"stale",value:s.staleExitMin,onChange:h=>m("staleExitMin",h),suffix:"min"})}),t(E,{label:"Trailing stop after target",htmlFor:"trail",help:"When TP is reached, keep riding and sell if the value drops this much from its peak (0 = sell at TP).",children:t(R,{id:"trail",value:s.trailPct,onChange:h=>m("trailPct",h),suffix:"%"})}),t(E,{label:"Take initials at target",htmlFor:"initials",help:"At TP sell just enough to get your stake back; the rest rides with the trailing stop (40% if none set).",children:t(re,{id:"initials",checked:s.takeInitials,label:"Take initials",onChange:h=>m("takeInitials",h)})}),t(E,{label:"Priority fee",htmlFor:"prio",children:t(R,{id:"prio",value:s.priorityFeeSol,onChange:h=>m("priorityFeeSol",h),step:1e-4,suffix:"SOL"})}),t(E,{label:"Daily loss limit",htmlFor:"dll",help:"Stops new entries for the rest of the UTC day (0 = off).",children:t(R,{id:"dll",value:s.maxDailyLossSol,onChange:h=>m("maxDailyLossSol",h),step:.05,suffix:"SOL"})}),t(E,{label:"Max trades per hour",htmlFor:"tph",children:t(R,{id:"tph",value:s.maxTradesPerHour,onChange:h=>m("maxTradesPerHour",h)})}),t(E,{label:"Buy the same coin again",htmlFor:"reentry",help:"Off: each coin gets one entry moment \\u2014 the first time it reaches your score. On: it can be bought again after dipping and coming back, which in simulation lost about 40% per trade.",children:t(re,{id:"reentry",checked:s.reentry,label:"Re-entry",onChange:h=>m("reentry",h)})}),t(E,{label:"Auto-tune (paper only)",htmlFor:"autotune",help:"After each learning run, switch score/TP/SL to the combination with the best proven results (95% worst case must beat the current one). Never touches live settings, and rests while the autopilot is on (it picks the whole rule).",children:t(re,{id:"autotune",checked:s.autoTune,label:"Auto-tune",onChange:h=>m("autoTune",h)})}),t(E,{label:"Paper delay",htmlFor:"lat",help:"Simulated time from decision to landing on-chain. Honest paper results need a realistic delay.",children:t(R,{id:"lat",value:s.paperLatencyMs,onChange:h=>m("paperLatencyMs",h),step:100,suffix:"ms"})})]})]}),t("div",{class:"grid two",style:"margin-top:12px",children:[t("div",{class:"card",children:[t("h2",{children:"Mode"}),t("div",{class:"chips",children:[t("button",{class:"chip","aria-pressed":e.mode==="paper",onClick:()=>w({mode:"paper"}),children:"Paper"}),t("button",{class:"chip","aria-pressed":e.mode==="live",disabled:!T,onClick:()=>w({mode:"live"}),children:"Live"})]}),t("p",{class:"muted",style:"font-size:13px",children:T?`Live wallet ${r?.live?.address?.slice(0,4)}\\u2026${r?.live?.address?.slice(-4)} \\xB7 balance ${r?.live?.balanceSol?.toFixed(3)??"?"} SOL \\xB7 cap ${r?.live?.maxPositionSol} SOL/trade.`:r?.live?.halted?`Live trading halted: ${r.live.halted}.`:"Live is locked. It unlocks only when the server owner sets LIVE_TRADING and a dedicated wallet \\u2014 see Setup."}),T&&e.autopilot&&t("p",{class:"faint",style:"font-size:12.5px",children:"Autopilot is on: with real money it trades only a rule proven at the real-money bar (100+ unseen trades, worst case above +2% per trade). Until one exists, new live entries wait."}),r?.live?.halted&&t("button",{class:"btn sm",onClick:()=>k("/api/live/resume",{}).then(()=>S("Live resumed")),children:"Resume live"})]}),t("div",{class:"card",children:[t("h2",{children:"Emergency"}),u?t("div",{class:"row wrap",children:[t("b",{children:"Sell everything now?"}),t("button",{class:"btn danger",onClick:async()=>{await k("/api/kill",{on:!0,sellAll:!0}),g(!1),S("Kill switch ON \\u2014 selling"),q()},children:"Yes, sell all"}),t("button",{class:"btn",onClick:()=>g(!1),children:"Cancel"})]}):t("div",{class:"row wrap",children:[t("button",{class:"btn danger",onClick:()=>g(!0),children:"Kill switch"}),t("span",{class:"muted",style:"font-size:13px",children:"Stops all new entries and sells every open position."})]}),a?.killed&&t("button",{class:"btn sm",style:"margin-top:8px",onClick:()=>k("/api/kill",{on:!1}).then(()=>q()),children:"Turn kill switch off"})]})]}),l&&t("div",{class:"savebar",role:"status",children:[t("span",{style:"flex:1",children:"Not saved yet \\u2014 the bot still trades on the saved settings."}),t("button",{class:"btn sm ghost",onClick:v,children:"Discard"}),t("button",{class:"btn sm primary",disabled:p,onClick:()=>w(),children:p?"Saving\\u2026":"Save"})]})]})}function So({funnel:e,threshold:n,scoreOnly:o,enabled:r,open:a,maxOpen:s}){if(!e)return t("div",{class:"card",children:"Loading\\u2026"});let i=r?e.scored===0?"No coins scored yet \\u2014 check that the data feeds are green (More \\u2192 Health).":e.maxScore<n?`No coin reached ${n} this hour (best was ${Math.round(e.maxScore)}). Lower the score to trade more often.`:e.signals===0?`Coins reached ${n}, but none crossed it since the bot was switched on or the threshold changed.`:a>=s?`All ${s} position slots are in use.`:e.entered>0?"Trading normally.":"Signals were blocked \\u2014 see the reasons below.":"Auto-trading is paused.";return t("div",{class:"card",children:[t("h2",{children:"Why no trade? \\xB7 last hour"}),t("p",{style:"margin:0 0 10px;font-weight:650",children:i}),t("div",{class:"stats",style:"grid-template-columns:repeat(4,1fr)",children:[t("div",{class:"stat",children:[t("div",{class:"k",children:"Coins scored"}),t("div",{class:"v num",children:e.scored})]}),t("div",{class:"stat",children:[t("div",{class:"k",children:["Reached ",n]}),t("div",{class:"v num",children:e.coinsAbove?.[Math.round(n)]??e.signals})]}),t("div",{class:"stat",children:[t("div",{class:"k",children:"Bought"}),t("div",{class:"v num good",children:e.entered})]}),t("div",{class:"stat",children:[t("div",{class:"k",children:"Missed"}),t("div",{class:"v num warn",children:e.failed})]})]}),t("div",{style:"margin:12px 0 4px",class:"faint",children:["Best score of each coin this hour (highest ",Math.round(e.maxScore),"):"]}),t(Qt,{bins:e.hist,threshold:n}),e.reasons.length>0&&t("div",{style:"margin-top:12px",children:[t("div",{class:"faint",style:"margin-bottom:6px",children:["Blocked because\\u2026 ",o&&t(x,{tone:"flare",children:"score only: filters skipped"})]}),t("table",{children:t("tbody",{children:e.reasons.slice(0,8).map(l=>t("tr",{children:[t("td",{children:l.text}),t("td",{class:"r num",children:l.n})]},l.reason))})})]})]})}function _o({settings:e,onApplied:n}){let[o,r]=b(null),[a,s]=b(null),[i,l]=b(null);A(()=>{k("/api/edges").then(g=>r(g.report)).catch(()=>{})},[]);let d=mn(o),p=e.mode==="live",c=async g=>{if(p&&a!==g.key){s(g.key);return}l(g.key);try{await k("/api/settings",g.settings);let f=e.autopilot?" The autopilot stays on: it keeps this rule unless a proven rule does clearly better.":"";S(e.enabled?`Now trading: ${g.name}.${f}`:`Strategy set: ${g.name}. Switch Auto-trading on to start.${f}`),s(null),n()}catch(f){S(String(f.message))}finally{l(null)}},u=!d.some(g=>Ke(e,g.settings));return t("div",{class:"card",style:"margin-top:12px",children:[t("h2",{children:"Strategy"}),t("p",{class:"faint",style:"margin:0 0 4px;font-size:12.5px",children:["One tap sets the whole rule \\u2014 entry score, which coins, take profit, stop loss and time limit. Fine-tune it below afterwards.",e.autopilot&&" The autopilot stays on when you pick one here or change the rule below: your rule then competes with the proven ones, and stays unless one does clearly better."]}),u&&t("div",{class:"strat active",children:t("div",{style:"flex:1;min-width:0",children:[t("div",{class:"row wrap",style:"gap:6px",children:[t("b",{children:"Custom"}),t(x,{tone:"flare",children:"active"})]}),t("div",{class:"num",style:"font-size:13px",children:[Le(e)," \\xB7 ",e.scoreOnly?"score only":"with filters"]})]})}),d.map(g=>{let f=Ke(e,g.settings);return t("div",{class:`strat ${f?"active":""}`,children:[t("div",{style:"flex:1;min-width:0",children:[t("div",{class:"row wrap",style:"gap:6px",children:[t("b",{children:g.name}),g.proof==="unproven"&&t(x,{tone:"warn",children:"unproven"}),g.proof==="data"&&t(x,{tone:"good",children:"held up on unseen data"}),f&&t(x,{tone:"flare",children:"active"})]}),t("div",{class:"num",style:"font-size:13px",children:Le(g.settings)}),t("div",{class:"faint",style:"font-size:12.5px",children:g.note})]}),!f&&t("button",{class:`btn sm ${a===g.key?"danger":"primary"}`,disabled:!!i,onClick:()=>c(g),children:i===g.key?"\\u2026":a===g.key?"Tap again \\u2014 real money":"Use this"})]},g.key)}),p&&t("p",{class:"faint note",children:"You are live: switching asks for a second tap. Open positions keep the rule they were bought with."})]})}var yn={age:["age20","age45","age90","age180","age360","age720"],mig:["mig60","mig300","mig900","mig3600"],prog:["prog25","prog50","prog75"]};function ko({draft:e,saved:n,edit:o}){let r=e.entryAt,a=r==="score"?"score":r.startsWith("age")?"age":r.startsWith("mig")?"mig":"prog",s=d=>o({...e,entryAt:d,...d.startsWith("mig")?{tradeAmm:!0}:d==="score"?{}:{tradeCurve:!0}}),i=Ve(r);return t("div",{class:"field",children:[t("div",{style:"font-weight:700;margin-bottom:6px",children:"Buy"}),t("div",{class:"chips",children:[["score","When the score reaches","score"],["age","After launch","age180"],["mig","After graduating","mig300"],["prog","On the way to graduation","prog50"]].map(([d,p,c])=>t("button",{class:"chip","aria-pressed":a===d,onClick:()=>a!==d&&s(c),children:p},d))}),(a==="age"||a==="mig")&&t("div",{class:"row wrap",style:"gap:6px;margin-top:8px",children:[t(Mo,{kind:a,sec:Number(r.slice(3)),onChange:d=>s(en(a,d))}),yn[a].map(d=>t("button",{class:"chip","aria-pressed":r===d,onClick:()=>s(d),children:te(d).replace(/ after .*/,"")},d))]}),a==="prog"&&t("div",{class:"chips",style:"margin-top:8px",children:yn.prog.map(d=>t("button",{class:"chip","aria-pressed":r===d,onClick:()=>s(d),children:te(d).replace(" to graduation","")},d))}),t("div",{class:"help",children:a==="score"?"Buys a coin the first time its score reaches your minimum and holds it.":t(M,{children:["Buys every coin ",t("b",{children:te(r)}),a==="mig"?" (graduated coins)":" (still on the bonding curve)"," \\u2014 the score is not used."," ",i?n.moments.includes(r)?"A moment of your own: the bot records it for every coin since you added it, so rules at it are measured and searched like the fixed ones.":"A moment of your own: once saved, the bot records it for every coin, so rules at it can be measured and searched after about a day of recordings.":"The bot records this moment for every coin, so the autopilot can weigh a rule at it right away."]})}),e.moments.length>0&&t("div",{class:"help row wrap",style:"gap:6px",children:[t("span",{children:"Moments of your own recorded for every coin:"}),e.moments.map(d=>t("span",{class:"row",style:"gap:2px",children:[t(x,{children:te(d)}),d!==r&&t("button",{class:"btn sm ghost","aria-label":`stop recording ${te(d)}`,title:"Stop recording it",onClick:()=>o({...e,moments:e.moments.filter(p=>p!==d)}),children:"\\xD7"})]},d))]})]})}function Mo({kind:e,sec:n,onChange:o}){let r=d=>String(+(d/60).toFixed(2)),[a,s]=b(r(n)),[i,l]=b(!1);return A(()=>{i||s(r(n))},[n,i]),t("span",{class:"row",style:"gap:6px",children:[t("input",{class:"inp",style:"width:84px",type:"text",inputMode:"decimal",value:a,"aria-label":e==="age"?"minutes after launch":"minutes after graduating",onFocus:()=>l(!0),onBlur:()=>l(!1),onInput:d=>{let p=d.target.value;s(p);let c=Number(p.replace(",","."));Number.isFinite(c)&&c>0&&o(Math.round(c*60))}}),t("span",{class:"muted",children:"min"})]})}function To({draft:e}){let n=ln(e,216e5);return t("p",{class:"faint",style:"font-size:12.5px;margin:10px 0 0",children:n?`The autopilot cannot weigh this rule on the recordings: ${n}. Until it has 30 trades of its own, any proven rule replaces it \\u2014 pick recorded values to let it compete.`:"The autopilot can weigh this rule on the recordings, with the same bar as the proven rules: it stays unless one does clearly better."})}var wn=36e5,xn={freshMs:6*wn,better:1.25,liveMinTrades:100,liveMinLo:.02,maxPlacebo:.2,checkAfter:30,forwardMin:40,trackMin:30,benchMs:24*wn};function Sn(){let[e,n]=b(null),[o,r]=b(""),[a,s]=b(!1),[i,l]=b(""),d=()=>k("/api/lab").then(u=>n(u.view)).catch(()=>{});if(A(()=>{d();let u=setInterval(d,6e4);return()=>clearInterval(u)},[]),!e)return null;let p=async()=>{if(o.trim()){s(!0);try{let u=await k("/api/lab/idea",{text:o});S(u.note),r(""),d()}catch(u){S(String(u.message))}finally{s(!1)}}},c=async()=>{try{let u=await k("/api/lab/summary");try{await navigator.clipboard.writeText(u.text),l(""),S("Copied. Paste it into a chat with Claude, then paste the rules it suggests back here, one at a time.")}catch{l(u.text)}}catch(u){S(String(u.message))}};return t("div",{class:"card",style:"margin-top:12px",children:[t("h2",{style:"margin-bottom:4px",children:"Lab"}),t("div",{class:"muted",style:"font-size:13px",children:["Invents rules the edge finder cannot try \\u2014 one or two conditions on any of the ",Pe.length," facts the bot records about a coin (money flowing in, smart wallets, holders, narrative and market heat\\u2026) \\u2014 and proves each one only on coins that came after it was invented. An idea is judged at ",$e.looks.join(", ")," coins; one without an edge passes by luck at most about once in ",Math.round(1/($e.alpha*$e.looks.length)),". Proven ideas go to the autopilot like any proven rule."]}),t("p",{class:"edge-meta",children:e.note}),e.proven.map(u=>t(mt,{i:u},u.id)),e.testing.map(u=>t(mt,{i:u},u.id)),!e.proven.length&&!e.testing.length&&t("p",{class:"faint note",children:"No ideas being tested yet."}),e.retired.length>0&&t("details",{class:"more",children:[t("summary",{children:["Did not hold up (",e.retired.length,")"]}),e.retired.map(u=>t(mt,{i:u},u.id))]}),t("div",{style:"margin-top:12px",children:[t("b",{style:"font-size:13.5px",children:"Test your own idea"}),t("div",{class:"row",style:"gap:8px;margin-top:6px",children:[t("input",{class:"inp wide",placeholder:"mig300 top10<=25% smart>=1 tp100 sl30 hold30",value:o,onInput:u=>r(u.target.value),onKeyDown:u=>u.key==="Enter"&&void p(),"aria-label":"rule to test"}),t("button",{class:"btn sm primary",disabled:a||!o.trim(),onClick:p,children:"Test it"})]}),t("p",{class:"faint note",children:["Your ideas: ",e.slots.mine," of ",e.slots.mineMax," at a time."]}),t("details",{class:"more",children:[t("summary",{children:"How to write a rule"}),t("p",{class:"faint note",children:e.format})]}),t("button",{class:"btn sm",onClick:c,children:"Copy a summary for Claude"}),t("p",{class:"faint note",children:"Free with the Claude plan you already have: paste the summary into a chat, ask for new rules, and test the ones you like here. They are judged like any other \\u2014 only on coins after you add them."}),i&&t("textarea",{class:"inp wide",readOnly:!0,rows:8,value:i,onFocus:u=>u.target.select(),"aria-label":"summary for Claude"})]})]})}function mt({i:e}){let n=e.status==="proven"?"good":e.status==="retired"?"bad":void 0;return t("div",{class:"edge",children:[t("div",{class:"row",style:"gap:8px;align-items:flex-start",children:[t("div",{class:"edge-rule",style:"flex:1",children:e.text}),t(x,{tone:n,children:e.status==="proven"?"proven":e.status==="retired"?"retired":e.source==="you"?"yours \\xB7 testing":"testing"})]}),t("div",{class:"num",style:"font-size:13px",children:e.n?t(M,{children:[t("b",{class:e.mean>0?"good":"bad",children:y(e.mean,1,!0)})," per trade on ",e.n," coins after it \\xB7 95% range ",y(e.lo,1,!0)," to ",y(e.hi,1,!0),e.coinsPerDay!==null&&` \\xB7 ~${e.coinsPerDay.toFixed(0)} coins/day`]}):t("span",{class:"faint",children:"Waiting for coins that come after it (each finishes about 6 hours after entry)."})}),e.status==="testing"&&e.nextLook&&t("div",{class:"faint num",style:"font-size:12.5px",children:["Next judged at ",e.nextLook," coins."]}),e.status==="proven"&&e.proof&&t("div",{class:"faint num",style:"font-size:12.5px",children:["Proven on ",e.proof.n," coins: worst case ",y(e.proof.lo,1,!0)," per trade",e.post&&e.post.n>0?` \\xB7 since then ${y(e.post.mean,1,!0)} on ${e.post.n}`:"","."]}),e.why&&t("div",{class:"faint",style:"font-size:12.5px",children:e.why}),e.seen&&t("div",{class:"faint num",style:"font-size:12px",children:["When invented, on past data: ",y(e.seen.mean,1,!0)," per trade on ",e.seen.n," (not proof)."]}),t("div",{class:"faint",style:"font-size:12px;font-family:var(--mono, monospace)",children:e.code})]})}var Ge={curve:"Bonding curve",amm:"Graduated"};function $o(e,n){return e==="trees"?`weighted sum + ${n??0} trees`:e==="linear"?"weighted sum":"starting assumptions"}function _n(){let[e,n]=b(null),[o,r]=b(""),[a,s]=b(!1),[i,l]=b("curve"),d=()=>k("/api/learning").then(v=>{n(v.view),r("")}).catch(v=>r(String(v.message??v)));A(()=>{d();let v=setInterval(d,6e4);return()=>clearInterval(v)},[]);let p=async()=>{s(!0);try{let v=await k("/api/learn/run",{});S(v.reports.some(w=>w.adopted)?"The bot switched to a better score":"Current score kept \\u2014 see the history below"),await d()}catch(v){S(String(v.message))}finally{s(!1)}};if(!e)return t("div",{class:"card",style:"margin-top:12px",children:[t("h2",{children:"What the bot learned"}),t("p",{class:"faint note",children:o||"Loading\\u2026"})]});let c=e.model,u=c.source==="trained",g=(c.rows.curve?.total??0)+(c.rows.amm?.total??0),f=(c.rows.curve?.entries??0)+(c.rows.amm?.entries??0),m=["curve","amm"].filter(v=>e.drivers[v]?.length),_=e.drivers[i]?.length?i:m[0]??"curve";return t("div",{class:"card",style:"margin-top:12px",children:[t("div",{class:"row",style:"align-items:flex-start",children:[t("div",{style:"flex:1",children:[t("h2",{style:"margin-bottom:4px",children:"What the bot learned"}),t("div",{class:"learn-head",children:u?t(M,{children:["Score retrained ",Q(c.createdAt)," on its own outcomes",g>0&&t(M,{children:[" ","\\u2014 ",se(g)," moments, ",se(f)," of them the moment a coin first reached a score (when the bot buys)"]}),"."]}):t(M,{children:["Still on its starting assumptions."," ",e.status.everyHours>0?`It learns once enough outcomes have finished: first try 20 min after start, then every ${e.status.everyHours} h.`:"It learns when you tap Retrain now, once enough outcomes have finished (the server does this by itself every few hours)."]})})]}),t("button",{class:"btn sm",disabled:a||e.status.running,onClick:p,children:a||e.status.running?"Learning\\u2026":"Retrain now"})]}),t("div",{class:"chips",style:"margin-top:10px",children:["curve","amm"].map(v=>t(x,{tone:c.recipe[v]==="trees"?"good":c.recipe[v]==="linear"?"flare":void 0,children:[Ge[v],": ",$o(c.recipe[v],c.trees[v])]},v))}),t("p",{class:"faint note",children:["The score is a weighted sum of ",be.length," signals; with enough data, small decision trees are added on top to learn combinations a sum cannot (say, heavy buying ",t("i",{children:"but"})," the dev already sold). A new score replaces the current one only if it predicts newer coins \\u2014 that neither of them has seen \\u2014 better. After every retrain, 50 is still a typical coin moment and 75 the top 5%, so your minimum score picks about the same share of coins \\u2014 better ones as the ranking improves."]}),t("h3",{class:"learn-sub",children:"Is the score still working?"}),e.fresh.map(v=>t(Po,{f:v},v.stage)),m.length>0&&t(M,{children:[t("div",{class:"row",style:"margin-top:14px;align-items:center",children:[t("h3",{class:"learn-sub",style:"flex:1;margin:0",children:"What moves the score now"}),m.length>1&&t("div",{class:"chips",children:m.map(v=>t("button",{class:"chip","aria-pressed":_===v,onClick:()=>l(v),children:Ge[v]},v))})]}),t(Lo,{list:e.drivers[_]??[]}),t("p",{class:"faint note",children:["Measured on the last ",se(e.driverCoins[_]??0),` coins. \\u2191 more of it raises the score \\xB7 \\u2193 lowers it \\xB7 \\u2195 depends on the other signals. Bars: share of the score\'s movement; "at start" is the share the starting assumptions gave it.`]})]}),t(Fo,{runs:e.history,status:e.status})]})}function Po({f:e}){let n=Ge[e.stage];if(e.verdict==="not_enough")return t("div",{class:"fresh",children:[t("div",{children:[t("b",{children:n})," ",t("span",{class:"faint",children:"\\xB7 checking"})]}),t("div",{class:"faint",style:"font-size:12.5px",children:[se(e.n)," finished outcomes of coins this score has not seen (",se(e.wins)," wins). The check needs 150 with 10 wins; each outcome is followed until it resolves (up to 6 h)."]})]});let o=e.verdict==="working"?"good":e.verdict==="slipping"?"warn":"bad",r=e.verdict==="working"?"working":e.verdict==="slipping"?"weaker":"not working",a=e.bands.filter(s=>s.n>0);return t("div",{class:"fresh",children:[t("div",{class:"row",style:"gap:8px",children:[t("b",{children:n}),t(x,{tone:o,children:r})]}),t("div",{style:"font-size:13px",children:["On ",t("b",{class:"num",children:se(e.n)})," coins it had not seen, the score ranked a winner above a loser ",t("b",{class:"num",children:y(e.auc)})," of the time",Number.isFinite(e.expected)?` (${y(e.expected)} when it was adopted)`:"","; 50% would be a coin toss. The top fifth by score won ",y(e.topWinRate),", all of them"," ",y(e.winRate),"."]}),a.length>1&&t("details",{class:"more",children:[t("summary",{children:"Promised vs. delivered, by score"}),t("div",{class:"tablewrap",children:t("table",{children:[t("thead",{children:t("tr",{children:[t("th",{children:"Score"}),t("th",{class:"r",children:"Moments"}),t("th",{class:"r",children:"Win chance it gave"}),t("th",{class:"r",children:"Actually won"})]})}),t("tbody",{children:a.map(s=>t("tr",{children:[t("td",{class:"num",children:[s.lo,"\\u2013",s.hi]}),t("td",{class:"r num",children:se(s.n)}),t("td",{class:"r num",children:y(s.predicted,1)}),t("td",{class:`r num ${s.n>=30&&Math.abs(s.actual-s.predicted)>.1?"warn":""}`,children:y(s.actual,1)})]},s.lo))})]})})]})]})}function Lo({list:e}){let n=Math.max(.01,...e.map(o=>o.share));return t("div",{class:"drivers",children:e.map(o=>{let r=o.dir==="up"?"\\u2191":o.dir==="down"?"\\u2193":"\\u2195",a=o.priorShare!==void 0&&Math.abs(o.share-o.priorShare)>=.04;return t("div",{class:"driver",children:[t("span",{class:`arrow ${o.dir==="up"?"good":o.dir==="down"?"bad":"muted"}`,"aria-label":o.dir,children:r}),t("span",{children:o.label}),t("span",{class:"num faint",children:y(o.share)}),t("div",{class:"bar",children:t("i",{style:{width:`${Math.round(o.share/n*100)}%`}})}),a&&t("span",{class:"was faint",children:[o.share>o.priorShare?"learned it matters more":"learned it matters less"," \\xB7 at start ",y(o.priorShare)]})]},o.key)})})}var Ao={schedule:"scheduled",manual:"by hand",drift:"score weakened",start:"after start"};function Fo({runs:e,status:n}){let o=Math.max(1,Math.round((n.nextRun-Date.now())/6e4)),r=n.nextRun>Date.now()?` \\xB7 next run in ${o>=120?`${Math.round(o/60)} h`:`${o} min`}`:"";return t("details",{class:"more",style:"margin-top:14px",children:[t("summary",{children:["Learning history (",e.length,")",r]}),n.lastError&&t("p",{class:"bad note",children:["Last run failed: ",n.lastError]}),!e.length&&t("p",{class:"faint note",children:"No learning run yet."}),[...e].reverse().map(a=>t("div",{class:"edge",children:[t("div",{class:"row",style:"gap:8px",children:[t("b",{children:new Date(a.at).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}),t(x,{tone:a.adopted?"good":void 0,children:a.adopted?"switched to a better score":"kept the score"}),t("span",{class:"faint",style:"font-size:12px",children:[Ao[a.trigger]??a.trigger," \\xB7 ",se(a.rows)," moments \\xB7 ",(a.ms/1e3).toFixed(1)," s"]})]}),a.stages.map(s=>t("div",{class:"faint",style:"font-size:12.5px",children:[Ge[s.stage],": ",s.reason,s.fresh>0&&Number.isFinite(s.after.auc)&&t(M,{children:[" ","\\xB7 ranking on unseen coins ",y(s.before.auc)," \\u2192 ",y(s.after.auc)]})]},s.stage))]},a.at))]})}function Tn(){let e=P(l=>l.settings),[n,o]=b(null),[r,a]=b(""),s=()=>k("/api/learn?days=14").then(o).catch(l=>a(String(l.message??l)));if(A(()=>{s();let l=setInterval(s,6e4);return()=>clearInterval(l)},[e?.minScore,e?.tpPct,e?.slPct]),r)return t(D,{children:r});if(!n)return t(D,{children:"Loading evidence\\u2026"});let i=Math.max(.05,...n.grid.filter(l=>l.n>0).map(l=>Math.abs(l.avgRet)));return t("div",{children:[t("div",{class:"section-title",children:[t("h2",{children:"Does the score make money?"}),t("span",{class:"muted num",children:[n.samples.toLocaleString()," resolved outcomes \\xB7 ",n.spanHours.toFixed(1)," h of data"]})]}),t("div",{class:`card ${n.gate.pass,""}`,style:`border-color:${n.gate.pass?"var(--good)":"var(--line)"}`,children:[t("div",{class:"row",style:"align-items:flex-start",children:[t("div",{style:"flex:1",children:[t("div",{class:"faint",style:"font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:700",children:["Go-live check \\xB7 score \\u2265 ",n.settings.minScore,", TP ",n.settings.tpPct,"%, SL ",n.settings.slPct,"%"]}),t("div",{style:"font-size:19px;font-weight:780;margin:4px 0",children:n.gate.verdict}),t("div",{class:"muted",children:n.gate.detail})]}),t(x,{tone:n.gate.pass?"good":"warn",children:n.gate.pass?"evidence \\u2713":"paper first"})]}),t("p",{class:"faint",style:"font-size:12.5px;margin:10px 0 0",children:["Every eligible coin is followed from fixed checkpoints and at every signal, as if bought with your size and delay, until the target or the stop is hit. Break-even win rate at these settings \\u2248 ",t("b",{children:y(n.breakEven)})," (fees, delay and stop slippage included)."]})]}),t(_n,{}),t(Eo,{mode:e?.mode??"paper",autopilot:!!e?.autopilot}),t(Sn,{}),n.suggestion&&!e?.autopilot&&t("div",{class:"card",style:"margin-top:12px;border-color:var(--flare)",children:[t("h2",{children:"Better settings found"}),t("p",{style:"margin:0 0 10px",children:[t("b",{children:["Score \\u2265 ",n.suggestion.minScore," \\xB7 TP ",n.suggestion.tpPct,"% \\xB7 SL ",n.suggestion.slPct,"%"]})," ","\\u2014 ",n.suggestion.why,"."]}),t("div",{class:"row wrap",children:[t("button",{class:"btn primary",onClick:async()=>{try{await k("/api/settings",{minScore:n.suggestion.minScore,tpPct:n.suggestion.tpPct,slPct:n.suggestion.slPct}),S("Applied \\u2014 new trades use these settings"),s()}catch(l){S(String(l.message))}},children:"Apply"}),t("span",{class:"faint",style:"font-size:12.5px",children:"Past results can stop working. The autopilot (Bot tab) switches rules by itself, only on proof from data the search never saw; auto-tune does this in paper mode (Bot \\u2192 Advanced)."})]})]}),t("div",{class:"grid two",style:"margin-top:12px",children:[t("div",{class:"card",children:[t("h2",{children:"Score buckets \\u2192 outcome"}),n.checkpoints===0?t(D,{children:"Outcomes resolve as coins hit their targets or stops \\u2014 first rows appear within minutes, solid numbers take a few days."}):t("div",{class:"tablewrap",children:t("table",{children:[t("thead",{children:t("tr",{children:[t("th",{children:"Score"}),t("th",{class:"r",children:"n"}),t("th",{class:"r",children:"Profitable"}),t("th",{class:"r",children:"Avg result"}),t("th",{class:"r",children:"95% range"})]})}),t("tbody",{children:[...n.buckets].reverse().map(l=>t("tr",{style:l.lo>=(e?.minScore??75)-9&&l.lo<=90&&l.lo+10>(e?.minScore??75)?"background:var(--flare-soft)":"",children:[t("td",{class:"num",children:[l.lo,"\\u2013",l.hi]}),t("td",{class:"r num",children:l.n}),t("td",{class:"r num",children:l.n?y(l.winRate):"\\u2014"}),t("td",{class:`r num ${l.avgRet>0?"good":l.avgRet<0?"bad":""}`,children:l.n?y(l.avgRet,1,!0):"\\u2014"}),t("td",{class:"r num faint",children:l.n>1?`${y(l.retLo,0,!0)} \\u2026 ${y(l.retHi,0,!0)}`:"\\u2014"})]},l.lo))})]})})]}),t("div",{class:"card",children:[t("h2",{children:"Pick a threshold"}),t("p",{class:"faint",style:"margin:0 0 8px;font-size:12.5px",children:n.thresholdSource==="entries"?"What happened after coins first reached each score \\u2014 the moment the bot buys \\u2014 with your TP/SL, delay and costs.":"For now: snapshots of coins above each score. Buying the moment a coin reaches a score usually does worse; this switches to real entry outcomes after 200 of them."}),t("div",{class:"tablewrap",children:t("table",{children:[t("thead",{children:t("tr",{children:[t("th",{children:"Score \\u2265"}),t("th",{class:"r",children:"Coins/hour"}),t("th",{class:"r",children:"Profitable"}),t("th",{class:"r",children:"Avg result"})]})}),t("tbody",{children:n.thresholds.map(l=>t("tr",{style:l.min===e?.minScore?"background:var(--flare-soft)":"",children:[t("td",{class:"num",children:l.min}),t("td",{class:"r num",children:Number.isFinite(l.tokensPerHour)?l.tokensPerHour.toFixed(1):"\\u2014"}),t("td",{class:"r num",children:l.n?y(l.winRate):"\\u2014"}),t("td",{class:`r num ${l.avgRet>0?"good":l.avgRet<0?"bad":""}`,children:l.n?y(l.avgRet,1,!0):"\\u2014"})]},l.min))})]})})]})]}),t("div",{class:"card",style:"margin-top:12px",children:[t("h2",{children:["Take profit \\xD7 stop loss \\xB7 coins scoring \\u2265 ",n.settings.minScore]}),t("p",{class:"faint",style:"margin:0 0 8px;font-size:12.5px",children:["Average result per trade for each exit combination, delay and costs included, from"," ",n.gridSource==="signals"?"your own signals":n.gridSource==="entries"?"coins at the moment they first reached your score":"snapshots of coins above your score (until entry data builds up)",". Darker green = better; cells with fewer than 30 outcomes are faded."]}),t("div",{class:"tablewrap",children:t("table",{class:"heat",children:[t("thead",{children:t("tr",{children:[t("th",{children:"TP \\\\ SL"}),[...new Set(n.grid.map(l=>l.sl))].map(l=>t("th",{style:"text-align:center",children:["\\u2212",l,"%"]},l))]})}),t("tbody",{children:[...new Set(n.grid.map(l=>l.tp))].map(l=>t("tr",{children:[t("th",{children:["+",l,"%"]}),n.grid.filter(d=>d.tp===l).map(d=>{let p=Number.isFinite(d.avgRet)?Math.min(1,Math.abs(d.avgRet)/i):0,c=d.avgRet>=0?`color-mix(in srgb,var(--good) ${Math.round(p*45)}%,transparent)`:`color-mix(in srgb,var(--bad) ${Math.round(p*45)}%,transparent)`,u=d.tp===e?.tpPct&&d.sl===e?.slPct;return t("td",{style:{background:d.n?c:"transparent",opacity:d.n<30?.45:1,outline:u?"2px solid var(--flare)":"none"},title:`n=${d.n}, 95% ${y(d.retLo,1)} \\u2026 ${y(d.retHi,1)}`,children:d.n?y(d.avgRet,1,!0):"\\u2014"},d.sl)})]},l))})]})}),n.best&&t("p",{style:"margin:10px 0 0",children:["Most robust so far: ",t("b",{children:["TP ",n.best.tp,"% / SL ",n.best.sl,"%"]})," \\u2014 average ",y(n.best.avgRet,1,!0),", worst-case (95%) ",y(n.best.retLo,1,!0)," over ",n.best.n," outcomes."]})]}),t("div",{class:"card",style:"margin-top:12px",children:[t("h2",{children:"Your paper results"}),t("dl",{class:"kv",children:[t("dt",{children:"Closed trades"}),t("dd",{children:n.paper.trades}),t("dt",{children:"Win rate"}),t("dd",{children:y(n.paper.winRate)}),t("dt",{children:"Profit"}),t("dd",{class:n.paper.pnlSol>=0?"good":"bad",children:[n.paper.pnlSol.toFixed(3)," SOL"]}),t("dt",{children:"Average trade"}),t("dd",{children:Number.isFinite(n.paper.avgPct)?`${n.paper.avgPct.toFixed(1)}%`:"\\u2014"}),t("dt",{children:"Profit factor"}),t("dd",{children:Number.isFinite(n.paper.profitFactor)?n.paper.profitFactor.toFixed(2):"\\u2014"}),t("dt",{children:"Worst drawdown"}),t("dd",{children:[n.paper.maxDrawdownSol.toFixed(3)," SOL"]})]})]})]})}var kn=e=>e>=48?`${(e/24).toFixed(1)} days`:`${e.toFixed(0)} h`;function Eo({mode:e,autopilot:n}){let[o,r]=b(null),[a,s]=b(!1);A(()=>{k("/api/edges").then(c=>r(c.report)).catch(()=>{})},[]);let i=async()=>{s(!0);try{r((await k("/api/edges/run",{})).report)}catch(c){S(String(c.message))}finally{s(!1)}},[l,d]=b(null),p=async c=>{if(e==="live"&&l!==c.text){d(c.text);return}try{await k("/api/settings",c.settings),d(null),S(`Now trading this rule \\u2014 score, exits, time limit and filters were replaced${n?". The autopilot stays on: it keeps this rule unless a proven rule does clearly better":""}`)}catch(u){S(String(u.message))}};return t("div",{class:"card",style:"margin-top:12px",children:[t("div",{class:"row",style:"align-items:flex-start",children:[t("div",{style:"flex:1",children:[t("h2",{style:"margin-bottom:4px",children:"Edge finder"}),t("div",{class:"muted",style:"font-size:13px",children:["Looks for profitable rules on its own: ",de.length+Object.keys(ie).length," kinds of entry (",de.length," score levels, and"," ",Object.keys(ie).length," fixed points in a coin\'s life such as halfway to graduation) \\xD7 ",an.length," coin conditions \\xD7 ",K.length*pe.length," exits (take profit ",_e[0],"\\u2013",_e[_e.length-1],"%, stop ",ke[0],"\\u2013",ke[ke.length-1],"%, optional time limit). The best are re-checked on newer data the search never saw."]})]}),t("button",{class:"btn sm",disabled:a||o?.running,onClick:i,children:a||o?.running?"Searching\\u2026":"Search now"})]}),!o&&t("p",{class:"faint note",children:"Runs every 2 hours (Telegram: /edges). Needs about a day of recorded market first."}),o?.status==="not_enough_data"&&t("p",{class:"faint note",children:o.note}),o?.status==="ok"&&t(M,{children:[t("p",{class:"edge-meta",children:["Scored ",t("b",{class:"num",children:o.tested.toLocaleString("en-US")})," rules on the first ",kn(o.discoveryHours),", re-checked the best ",o.candidates," on the last"," ",kn(o.holdoutHours),": ",t("b",{children:[o.survivors.length," held up"]}),\'. On shuffled data, where no rule can work, the same search "found" \',o.placebo.avgSurvivors.toFixed(1)," per run \\u2014 that is its rate of fooling itself."]}),o.survivors.slice(0,5).map(c=>t(Mn,{s:c,confirming:l===c.text,apply:p},c.text)),o.survivors.length>5&&t("details",{class:"more",children:[t("summary",{children:[o.survivors.length-5," more variations"]}),o.survivors.slice(5).map(c=>t(Mn,{s:c,confirming:l===c.text,apply:p},c.text))]}),o.survivors.length>0&&t("p",{class:"faint note",children:"Coins/day counts every coin that qualified; your size, open-position and hourly limits decide how many the bot actually takes."}),o.survivors.length>0&&n&&t("p",{class:"note",children:o.placebo.avgSurvivors<=xn.maxPlacebo?"Autopilot is on: the bot trades the best of these by itself (Bot tab). Picking one here makes it your rule, and the autopilot stays on: a proven rule replaces it only when clearly better.":"Autopilot is on but does not use these: on shuffled data the same search found rules too, so they may be luck."}),!o.survivors.length&&t("p",{class:"note",children:o.note}),o.failed.length>0&&t("details",{class:"more",children:[t("summary",{children:["Looked good, then failed on newer data (",o.failed.length,")"]}),o.failed.map(c=>t("div",{class:"edge",children:[t("div",{children:c.text}),t("div",{class:"faint num",style:"font-size:12.5px",children:[y(c.discovery.mean,1,!0)," in the search data \\u2192 ",y(c.holdout.mean,1,!0)," on the newest data (",c.holdout.n," trades)"]})]},c.text))]})]})]})}function Mn({s:e,confirming:n,apply:o}){return t("div",{class:"edge",children:[t("div",{class:"edge-rule",children:e.text}),t("div",{class:"num",style:"font-size:13px",children:[t("b",{class:e.holdout.mean>0?"good":"bad",children:y(e.holdout.mean,1,!0)})," per trade on the newest data \\xB7 worst case ",y(e.holdout.lo,1,!0)," \\xB7 ",e.holdout.n," ","trades \\xB7 ",y(e.holdout.winRate)," winners \\xB7 ~",e.tradesPerDay.toFixed(0)," coins/day"]}),t("div",{class:"faint num",style:"font-size:12.5px",children:["In the search data ",y(e.discovery.mean,1,!0)," \\xB7 every coin reaching ",e.level,", same exit: ",y(e.baseline,1,!0)]}),t("button",{class:`btn sm ${n?"danger":"primary"}`,style:"justify-self:start;margin-top:4px",onClick:()=>o(e),children:n?"Tap again \\u2014 real money":"Use this rule"})]})}var Ye={bot_off:"Auto-trading is paused",kill_switch:"Kill switch is on",autopilot_hold:"Autopilot: no rule is proven enough for real money yet \\u2014 new live entries wait (open positions are still managed)",stage_off:"This stage is turned off in settings",non_sol_quote:"Coin is not paired with SOL",already_traded:"Already traded this coin (re-entry off)",max_open:"Max open positions reached",pending:"An order for this coin is already in flight",daily_loss_limit:"Daily loss limit reached",rate_limit:"Max trades per hour reached",feed_down:"Live data feed is down \\u2014 not trading blind",warming_up:"Learning this market\'s score scale (first minutes after install)",insufficient_balance:"Not enough SOL \\u2014 paper: Trades tab \\u2192 Add paper SOL; live: fund the wallet",slippage:"Price moved more than your slippage before the buy landed",migrating:"Coin is migrating to PumpSwap (not tradable for a moment)",rule_conditions:"Does not meet the conditions of the rule in use",not_followed:"Its price is not followed right now (more graduated coins than the bot can follow at once) \\u2014 not buying at an old price",no_price:"No tradable price yet",no_liquidity:"Not enough liquidity",size_too_small:"Position size too small after fees",live_error:"Live order error",live_disabled:"Live trading is not enabled on the server","filter:mcap_min":"Market cap below your minimum","filter:mcap_max":"Market cap above your maximum","filter:dev":"Dev holds more than your limit","filter:top10":"Top 10 holders above your limit","filter:bundle":"Launch bundle above your limit","filter:buyers":"Fewer buyers than your minimum","filter:age_min":"Coin younger than your minimum age","filter:age_max":"Coin older than your maximum age","filter:socials":"No socials (you require them)","filter:serial_dev":"Dev launched too many coins today","filter:dev_sold":"Dev already sold more than your limit"};function Ro(e){let n=Math.round((Date.now()-e)/6e4);return n<1?"just now":n<60?`${n} min ago`:`${Math.round(n/60)} h ago`}var ht=20,Co=1e6/30;function $n(e,n){try{navigator.clipboard.writeText(e).then(()=>S(`${n} copied`),()=>S("Select the text and copy it"))}catch{S("Select the text and copy it")}}function Ae({n:e,title:n,done:o,children:r}){return t("div",{class:`card step ${o?"done":""}`,children:[t("div",{class:"row",style:"gap:10px;margin-bottom:8px",children:[t("span",{class:"stepno",children:o?"\\u2713":e}),t("b",{style:"flex:1;font-size:15px",children:n}),o&&t(x,{tone:"good",children:"done"})]}),r]})}function Pn(){let e=P(L=>L.settings),[n,o]=b(null),[r,a]=b(!1),[s,i]=b(""),[l,d]=b(""),[p,c]=b(""),[u,g]=b(""),[f,m]=b(""),[_,v]=b("0.05"),[w,T]=b("0.25"),[U,W]=b(""),G=()=>k("/api/setup").then(L=>{o(L),a(!1)}).catch(()=>{});if(A(()=>{if(N.demo)return;G();let L=setInterval(G,4e3);return()=>clearInterval(L)},[]),N.demo)return t("div",{class:"card",children:[t("h2",{children:"Setup"}),t("p",{style:"margin-top:0",children:"On your own bot this page sets everything up with buttons \\u2014 no files to edit: the market-data key, Telegram alerts, a link for your phone, and going live with a wallet when you decide to."}),t("button",{class:"btn primary",onClick:()=>ue("more","deploy"),children:"How to install the real bot"})]});if(!n)return t("div",{class:"empty",children:"Loading\\u2026"});let z=async(L,In,Bn,Hn)=>{i(L);try{let me=await k(In,Bn);Hn(me),me.restarting?a(!0):me.note&&S(me.note),G()}catch(me){S(String(me.message))}finally{i("")}},C=n.stream.feed,h=C?.status==="open",H=C?.mbPerDay?C.mbPerDay*ht:null,Y=Number(p||n.stream.budgetMb),I=L=>Math.round(L).toLocaleString("en-US"),$=n.update,gt=s==="update",bt=$&&t("div",{class:`card step ${$.available?"hot":$.can&&$.checkedAt?"done":""}`,children:[t("div",{class:"row",style:"gap:10px;margin-bottom:8px",children:[t("span",{class:"stepno",children:$.available?"\\u2191":$.can&&$.checkedAt?"\\u2713":"\\u21BB"}),t("b",{style:"flex:1;font-size:15px",children:$.available?"A new version of SIGNAL is ready":$.can&&$.checkedAt?"SIGNAL is up to date":"Updates"}),$.current&&t("span",{class:"faint num",title:"this bot\'s version",children:["v ",$.current.slice(0,7)]})]}),$.available&&$.can&&t(M,{children:[t("p",{class:"muted",style:"margin:0 0 8px",children:"One tap: the bot downloads it, restarts by itself in about a minute, and keeps your keys, settings, history and open trades."}),t("button",{class:"btn primary",disabled:!!s,onClick:()=>z("update","/api/setup/update",{},L=>L.version&&S(`Installed ${String(L.version).slice(0,7)} \\u2014 restarting`)),children:gt?$.state==="installing"?"Installing\\u2026":"Downloading\\u2026":"Update now"})]}),$.available&&!$.can&&t("p",{class:"muted",style:"margin:0",children:$.why}),!$.available&&t("div",{class:"row wrap",style:"gap:8px",children:[t("span",{class:"faint",style:"flex:1",children:$.can?$.checkedAt?`Checked ${Ro($.checkedAt)} \\xB7 checks by itself every few hours.`:"Checks by itself every few hours.":$.why}),$.can&&t("button",{class:"btn sm ghost",disabled:!!s,onClick:()=>z("check","/api/setup/update-check",{},L=>S(L.update?.available?"A new version is ready":L.update?.checkedAt?"Up to date":"Could not reach GitHub \\u2014 try later")),children:s==="check"?"Checking\\u2026":"Check now"})]}),$.state==="failed"&&$.error&&!gt&&t("p",{class:"note",style:"color:var(--bad);margin-bottom:0",children:["Last try: ",$.error]})]});return t("div",{class:"grid setup",children:[r&&t("div",{class:"banner sim",style:"margin:0;width:100%",children:"Restarting the bot to apply it \\u2014 this page reconnects by itself in a few seconds."}),$?.available&&bt,t(Ae,{n:1,title:"Market data",done:h,children:[t("p",{class:"muted",style:"margin-top:0",children:["Every pump.fun trade comes from the ",t("b",{children:"free public Solana feed"})," \\u2014 no key, no account, no cost. Coins that graduate to PumpSwap are followed one by one while they matter (the ones you hold, and fresh graduates for an hour)."]}),t("p",{class:"faint note",style:"margin-top:0",children:["Now:"," ",C?`${n.stream.source==="rpc"?"through your key":"free public feed"} (${C.host}) \\xB7 ${C.status}, ${C.msgs.toLocaleString("en-US")} messages`:"not connected",C&&(C.netMbPerDay??C.mbPerDay)!==null&&` \\xB7 about ${I(C.netMbPerDay??C.mbPerDay)} MB a day of internet`,C?.budget&&` \\xB7 today ${I(C.budget.usedMb)} of ${I(C.budget.limitMb)} MB through your key${C.budget.onFree?" \\u2014 cap reached, on the free feed until 00:00 UTC":""}`]}),t("b",{style:"display:block;margin:10px 0 4px",children:"Your RPC key (optional)"}),t("p",{class:"muted",style:"margin:0 0 8px",children:["Needed only to send orders when you go live. A free Helius key is enough: sign up at"," ",t("a",{href:"https://dashboard.helius.dev",target:"_blank",rel:"noopener",children:"dashboard.helius.dev"}),", open ",t("b",{children:"API Keys"}),", copy the key and paste it here. ",n.rpc.isPublic?"No key saved yet.":`Key saved (${n.rpc.host}).`]}),t("div",{class:"row wrap",style:"gap:8px",children:[t("input",{class:"inp wide",type:"password",autoComplete:"off",placeholder:"Helius API key",value:l,onInput:L=>d(L.target.value)}),t("button",{class:"btn",disabled:!l||!!s,onClick:()=>z("rpc","/api/setup/rpc",{key:l},()=>d("")),children:s==="rpc"?"Testing\\u2026":"Save key"})]}),!n.rpc.isPublic&&t(M,{children:[t("b",{style:"display:block;margin:14px 0 4px",children:"Stream trades through your key instead?"}),t("p",{class:"muted",style:"margin:0 0 8px",children:["Only if the free feed keeps dropping. Keys are billed by data: Helius charges about ",ht," credits per MB, and its free plan has about"," ",I(Co)," credits a day.",H!==null&&` The stream measured now is about ${I(C.mbPerDay)} MB a day \\u2014 about ${I(H)} credits a day through a key.`," With a daily cap the key carries the stream until the cap, then the free feed takes over until 00:00 UTC."]}),t("div",{class:"row wrap",style:"gap:8px;align-items:center",children:[t("div",{class:"chips",children:[t("button",{class:"chip","aria-pressed":n.stream.chosen==="public",disabled:!!s,onClick:()=>z("stream","/api/setup/stream",{source:"public",budgetMb:Y},()=>{}),children:"Free public feed"}),t("button",{class:"chip","aria-pressed":n.stream.chosen==="rpc",disabled:!!s,onClick:()=>z("stream","/api/setup/stream",{source:"rpc",budgetMb:Y},()=>{}),children:"Through my key"})]}),t("label",{class:"row",style:"gap:6px",children:["at most",t("input",{class:"inp",style:"max-width:90px",inputMode:"numeric",value:p||String(n.stream.budgetMb),onInput:L=>c(L.target.value)}),"MB a day \\u2248 ",I(Y*ht)," credits"]})]})]})]}),t(Ae,{n:2,title:"Telegram alerts (optional)",done:n.telegram.linked,children:[n.telegram.linked?t("p",{class:"muted",style:"margin:0",children:"Linked. You get a message for every buy and sell, and can send /status, /pause, /resume, /score 75, /tp 100, /sl 50, /hold 10, /kill."}):n.telegram.code?t("p",{style:"margin:0",children:["Now open your new bot in Telegram and send it this code: ",t("b",{class:"num linkcode",children:n.telegram.code}),t("span",{class:"faint",children:" \\u2014 this page turns green when it arrives."})]}):t(M,{children:[t("ol",{class:"steps",style:"margin:0 0 8px",children:[t("li",{children:["In Telegram, open ",t("b",{children:"@BotFather"})," and send ",t("code",{children:"/newbot"}),"."]}),t("li",{children:\'Pick any name, then a username ending in "bot".\'}),t("li",{children:"Copy the token it gives you (looks like 123456789:AAH\\u2026) and paste it here."})]}),t("div",{class:"row wrap",style:"gap:8px",children:[t("input",{class:"inp wide",type:"password",autoComplete:"off",placeholder:"Bot token from @BotFather",value:u,onInput:L=>g(L.target.value)}),t("button",{class:"btn primary",disabled:!u||!!s,onClick:()=>z("tg","/api/setup/telegram",{token:u},()=>g("")),children:s==="tg"?"Checking\\u2026":"Connect"})]})]}),n.telegram.tokenSet&&t("button",{class:"btn sm ghost",style:"margin-top:6px",onClick:()=>z("tgoff","/api/setup/telegram-off",{},()=>S("Telegram disconnected")),children:"Disconnect Telegram"})]}),t(Ae,{n:3,title:"Paper trading",done:!!e?.enabled&&e.mode==="paper",children:[t("p",{class:"muted",style:"margin:0 0 8px",children:["Fake money on the real market. Bot tab \\u2192 pick a ",t("b",{children:"Strategy"})," \\u2192 switch ",t("b",{children:"Auto-trading"})," on. Leave it running for days; the Learn tab tells you when the evidence is strong enough to go live."]}),t("button",{class:"btn",onClick:()=>ue("bot"),children:"Open the Bot tab"})]}),t(Ae,{n:4,title:"Your phone",done:!!n.anywhereUrl,children:[t("p",{class:"muted",style:"margin:0 0 8px",children:"Telegram works anywhere with nothing more to set up: /status, /strategy, /score 75, /pause, /update\\u2026 For the full dashboard on your phone:"}),n.anywhereUrl?t(M,{children:[t("b",{style:"display:block;margin-bottom:4px",children:"Anywhere (Tailscale)"}),t("div",{class:"copyline",children:[t("code",{children:n.anywhereUrl}),t("button",{class:"btn sm",onClick:()=>$n(n.anywhereUrl,"Link"),children:"Copy"})]}),t("p",{class:"faint note",children:"Open it on your phone and add it to your home screen. Telegram\'s /link sends it to you too."})]}):t("ol",{class:"steps",style:"margin:0 0 8px",children:[t("li",{children:["Install"," ",t("a",{href:"https://tailscale.com/download",target:"_blank",rel:"noopener",children:"Tailscale"})," ","(free) on this computer and sign in (Google works)."]}),t("li",{children:"Install the Tailscale app on your phone and sign in with the same account."}),t("li",{children:"A link that works anywhere appears here in a minute \\u2014 and Telegram\'s /link sends it to your phone."})]}),n.phoneUrl&&t(M,{children:[t("b",{style:"display:block;margin:10px 0 4px",children:"At home (same Wi-Fi)"}),t("div",{class:"copyline",children:[t("code",{children:n.phoneUrl}),t("button",{class:"btn sm",onClick:()=>$n(n.phoneUrl,"Link"),children:"Copy"})]})]})]}),t(Ae,{n:5,title:"Go live with real money \\u2014 only when ready",done:n.live.enabled&&n.live.ready,children:[n.live.enabled?t(M,{children:[t("p",{style:"margin:0 0 6px",children:["Live trading is allowed with wallet"," ",t("code",{children:[n.live.address?.slice(0,4),"\\u2026",n.live.address?.slice(-4)]})," ","\\xB7 max ",n.live.maxPositionSol," SOL per trade \\xB7 stops for the day after losing ",n.live.maxDailyLossSol," SOL."," ",n.live.ready?"Switch Bot tab \\u2192 Mode \\u2192 Live to start.":"The wallet is not ready yet (check More \\u2192 Health)."]}),t("div",{class:"row wrap",style:"gap:8px",children:[t("button",{class:"btn",onClick:()=>ue("bot"),children:"Open the Bot tab"}),t("button",{class:"btn danger",disabled:!!s,onClick:()=>z("off","/api/setup/live-off",{},()=>S("Live trading off \\u2014 back to paper")),children:"Turn live off"})]})]}):n.privateChannel?t(M,{children:[n.rpc.isPublic&&t("p",{class:"note warn",style:"margin-top:0",children:"Save your free Helius key in step 1 first: orders are sent through it (the public endpoint is slow for sending)."}),t("ol",{class:"steps",style:"margin:0 0 10px",children:[t("li",{children:"In Phantom, create a new account used only by the bot, and send it the SOL you can afford to lose."}),t("li",{children:"Phantom \\u2192 Settings \\u2192 Manage accounts \\u2192 that account \\u2192 Show private key. Copy it."}),t("li",{children:"Paste it below. It stays on this computer and is never shown again."})]}),t("div",{class:"grid",style:"gap:8px",children:[t("input",{class:"inp wide",type:"password",autoComplete:"off",placeholder:n.live.walletSet?"Wallet saved \\u2014 paste only to replace it":"Bot wallet private key",value:f,onInput:L=>m(L.target.value)}),t("label",{class:"row",style:"gap:8px",children:[t("span",{style:"flex:1",children:"Max SOL per trade"}),t("input",{class:"inp",inputMode:"decimal",value:_,onInput:L=>v(L.target.value)})]}),t("label",{class:"row",style:"gap:8px",children:[t("span",{style:"flex:1",children:"Stop for the day after losing (SOL)"}),t("input",{class:"inp",inputMode:"decimal",value:w,onInput:L=>T(L.target.value)})]}),t("input",{class:"inp wide",autoComplete:"off",placeholder:\'Type "I understand the risk"\',value:U,onInput:L=>W(L.target.value)}),t("button",{class:"btn danger",disabled:!f&&!n.live.walletSet||!U||!!s,onClick:()=>z("live","/api/setup/live",{walletKey:f,maxPositionSol:Number(_),maxDailyLossSol:Number(w),confirm:U},L=>{m(""),W(""),S(`Live allowed for wallet ${String(L.address).slice(0,4)}\\u2026${String(L.address).slice(-4)}`)}),children:"Allow live trading"})]}),t("p",{class:"faint note",children:"After the restart, switch Bot tab \\u2192 Mode \\u2192 Live. The limits above cannot be raised from the Bot tab."})]}):t("p",{class:"muted",style:"margin:0",children:"For safety, a wallet can only be added on the computer running the bot \\u2014 open http://localhost:8787 there."}),n.live.walletSet&&n.privateChannel&&t("button",{class:"btn sm ghost",style:"margin-top:6px",onClick:()=>z("rm","/api/setup/wallet-remove",{},()=>S("Wallet removed from this bot")),children:"Remove the wallet from this bot"})]}),!$?.available&&bt,!n.supervised&&t("p",{class:"faint note",children:"This bot was started without its starter script, so after saving you will need to close it and start it again. Use start-windows.bat (or start-mac.command) so this happens by itself."})]})}var Oo=[["signals","Signals log"],["narratives","Narratives"],["wallets","Smart wallets"],["health","Health"],["setup","Setup"]];function Ln({open:e}){let n=P(s=>s.nav),[o,r]=b(n?.tab==="more"&&n.sub?n.sub:N.moreTabs[0]?.key??"signals");A(()=>{n?.tab==="more"&&n.sub&&r(n.sub)},[n?.at]);let a=N.moreTabs.find(s=>s.key===o);return t("div",{children:[t("div",{class:"chips",style:"margin:14px 0",children:[...N.moreTabs.map(s=>[s.key,s.label]),...Oo].map(([s,i])=>t("button",{class:"chip","aria-pressed":o===s,onClick:()=>r(s),children:i},s))}),a&&a.render(),o==="signals"&&t(No,{open:e}),o==="narratives"&&t(Do,{open:e}),o==="wallets"&&t(Io,{}),o==="health"&&t(Bo,{}),o==="setup"&&t(M,{children:[t(Pn,{}),t(Ho,{})]})]})}function No({open:e}){let n=P(r=>r.signals),o=P(r=>r.solUsd);return n.length?t("div",{class:"card flat",style:"padding:4px 8px",children:t("div",{class:"tablewrap",children:t("table",{children:[t("thead",{children:t("tr",{children:[t("th",{children:"Time"}),t("th",{children:"Coin"}),t("th",{class:"r",children:"Score"}),t("th",{class:"r",children:"Mcap"}),t("th",{children:"Decision"})]})}),t("tbody",{children:n.map(r=>t("tr",{style:"cursor:pointer",onClick:()=>e(r.mint),children:[t("td",{class:"faint num",children:fe(r.ts)}),t("td",{children:t("b",{children:["$",r.symbol||"?"]})}),t("td",{class:"r num",children:Math.round(r.score)}),t("td",{class:"r num",children:ee(r.mcapSol,o)}),t("td",{style:"white-space:normal",children:[t(x,{tone:r.decision==="entered"?"good":r.decision==="blocked"?void 0:r.decision==="failed"?"warn":"flare",children:r.decision})," ",t("span",{class:"faint",children:r.reason?Ye[r.reason]??r.reason:""})]})]},r.id))})]})})}):t(D,{children:"Every time a coin crosses your score it is logged here with what the bot did about it."})}function Do({open:e}){let[n,o]=b(null),r=P(a=>a.solUsd);return A(()=>{let a=()=>k("/api/narratives").then(i=>o(i.clusters)).catch(()=>o([]));a();let s=setInterval(a,15e3);return()=>clearInterval(s)},[]),n?n.length?t("div",{class:"list",children:[t("p",{class:"muted",style:"margin:0 0 4px",children:"Same idea, many coins: attention coordinates on one. Leaders (biggest market cap) tend to keep the flow; copies usually fade."}),n.map(a=>t("button",{class:"coin",onClick:()=>a.leader&&e(a.leader),children:[t("div",{class:"score b2",style:"font-size:15px",children:[a.size,t("small",{children:"COINS"})]}),t("div",{class:"body",children:[t("div",{class:"title",children:t("span",{class:"sym",children:a.key.replace(/^(t|w|tw|x):/,s=>({"t:":"$","w:":"","tw:":"tweet ","x:":"@"})[s]??"")})}),t("div",{class:"meta",children:[t("span",{children:["leader ",t("b",{children:["$",a.leaderSymbol??"?"]})," ",a.leaderName?`\\xB7 ${a.leaderName}`:""]}),t("span",{children:ee(a.leaderMcap,r)}),a.leaderScore!==void 0&&t("span",{children:["score ",Math.round(a.leaderScore)]}),t("span",{children:["first ",Q(a.firstTs)]})]})]})]},a.key))]}):t(D,{children:"No narrative clusters in the last hour yet. When several coins launch around the same name, ticker or tweet, they group here \\u2014 and the market usually picks one winner."}):t(D,{children:"Loading\\u2026"})}function Io(){let[e,n]=b(null);return A(()=>{k("/api/wallets").then(n).catch(()=>n({wallets:[]}))},[]),e?t("div",{class:"card flat",children:[t("h3",{children:"Learned from the order flow"}),t("p",{class:"muted",style:"margin-top:0",children:[e.tracked?.toLocaleString()," wallets tracked \\xB7 ",t("b",{children:e.smart})," currently qualify as smart (\\u22658 closed coins, high win rate and ROI, not serial devs). They are a score input, never a copy-trade rule."]}),e.wallets.length===0?t(D,{children:"Needs a few hours of data before wallets have enough closed trades to judge."}):t("div",{class:"tablewrap",children:t("table",{children:[t("thead",{children:t("tr",{children:[t("th",{children:"Wallet"}),t("th",{class:"r",children:"Coins"}),t("th",{class:"r",children:"Win"}),t("th",{class:"r",children:"Avg ROI"}),t("th",{class:"r",children:"Profit"}),t("th",{children:"Tags"})]})}),t("tbody",{children:e.wallets.map(o=>t("tr",{children:[t("td",{class:"mono",children:N.demo?t("span",{class:"mono",children:ce(o.address)}):t("a",{href:`https://solscan.io/account/${o.address}`,target:"_blank",rel:"noopener",children:ce(o.address)})}),t("td",{class:"r num",children:o.closed}),t("td",{class:"r num",children:y(o.winRate)}),t("td",{class:"r num",children:y(o.avgRoi)}),t("td",{class:`r num ${o.pnl>=0?"good":"bad"}`,children:[o.pnl.toFixed(2)," SOL"]}),t("td",{children:o.tags.map(r=>t(x,{tone:r==="smart"?"good":r==="serial-dev"||r==="bundler"?"bad":void 0,children:r},r))})]},o.address))})]})})]}):t(D,{children:"Loading\\u2026"})}function Bo(){let e=P(i=>i.health),n=P(i=>i.connected),[o,r]=b([]);if(A(()=>{k("/api/logs").then(i=>r(i.lines)).catch(()=>{})},[]),!e)return t(D,{children:"Loading\\u2026"});let a=Date.now(),s=e.feeds.some(i=>i.critical&&i.status==="open");return t("div",{class:"grid",children:[!s&&t("div",{class:"banner bad",style:"margin:0",children:"No live trade stream. The bot needs the Solana RPC firehose (free Helius key) or a PumpPortal API key to score coins \\u2014 see Setup & help."}),t("div",{class:"card",children:[t("h2",{children:"Data feeds"}),t("div",{class:"tablewrap",children:t("table",{children:[t("thead",{children:t("tr",{children:[t("th",{children:"Feed"}),t("th",{children:"Status"}),t("th",{class:"r",children:"Messages"}),t("th",{class:"r",children:"Last"}),t("th",{class:"r",children:"Reconnects"})]})}),t("tbody",{children:e.feeds.map(i=>t("tr",{children:[t("td",{children:[i.name," ",i.critical&&t(x,{children:"primary"})]}),t("td",{style:"white-space:normal",children:[t("span",{class:`dot ${i.status==="open"?"on":i.status==="connecting"?"mid":"off"}`,style:"display:inline-block;margin-right:6px"}),i.status,i.note?t("span",{class:"faint",children:[" \\xB7 ",i.note]}):null]}),t("td",{class:"r num",children:i.msgs.toLocaleString()}),t("td",{class:"r num",children:i.lastMsgAt?`${Math.round((a-i.lastMsgAt)/1e3)}s`:"\\u2014"}),t("td",{class:"r num",children:i.reconnects})]},i.name))})]})})]}),t("div",{class:"grid two",children:[t("div",{class:"card",children:[t("h2",{children:"Engine"}),t("dl",{class:"kv",children:[t("dt",{children:"Dashboard link"}),t("dd",{children:n?"live":"reconnecting\\u2026"}),t("dt",{children:"Uptime"}),t("dd",{children:[(e.uptimeSec/3600).toFixed(1)," h"]}),e.dataDir&&t(M,{children:[t("dt",{children:"Data folder"}),t("dd",{style:"word-break:break-all",children:e.dataDir})]}),e.saved&&t(M,{children:[t("dt",{children:"Settings saved"}),t("dd",{class:e.saved.failures>=3?"bad":"",children:[e.saved.at?`${Math.max(0,Math.round((a-e.saved.at)/1e3))} s ago`:"nothing to save yet",e.saved.failures>0&&` \\xB7 ${e.saved.failures} failed in a row`]})]}),t("dt",{children:"Events processed"}),t("dd",{children:e.events?.toLocaleString()}),t("dt",{children:"Coins in memory / scored"}),t("dd",{children:[e.tokens," / ",e.scored]}),t("dt",{children:"Launches \\xB7 trades seen"}),t("dd",{children:[e.creates?.toLocaleString()," \\xB7 ",e.trades?.toLocaleString()]}),t("dt",{children:"PumpSwap swaps (unmapped)"}),t("dd",{children:[e.ammSwaps?.toLocaleString()," (",e.unmappedAmm,")"]}),t("dt",{children:"Reserve convention"}),t("dd",{children:e.ammReserveConvention}),t("dt",{children:"Wallets / smart"}),t("dd",{children:[e.wallets?.toLocaleString()," / ",e.smartWallets]}),t("dt",{children:"Outcomes tracking / resolved"}),t("dd",{children:[e.hypotheticalsOpen?.toLocaleString()," / ",e.samplesResolved?.toLocaleString()]}),t("dt",{children:"Errors \\xB7 bad events"}),t("dd",{children:[e.errors," \\xB7 ",e.badEvents]}),t("dt",{children:"Event-loop lag"}),t("dd",{children:[e.loopLagMs??0," ms"]}),t("dt",{children:"Memory \\xB7 data"}),t("dd",{children:[e.memMb??"?"," MB \\xB7 ",e.storage?`${(e.storage.usedMb/1e3).toFixed(1)} of ${(e.storage.maxMb/1e3).toFixed(0)} GB${e.storage.auto?" (automatic: a fifth of the disk)":""}`:`${e.diskMb??"?"} MB`]}),e.storage&&t(M,{children:[t("dt",{children:"Data kept"}),t("dd",{children:["outcomes ",((e.storage.byDir?.samples??0)/1e3).toFixed(1)," GB \\xB7 raw recordings ",((e.storage.byDir?.record??0)/1e3).toFixed(1)," GB"]}),e.storage.learnSamples&&t(M,{children:[t("dt",{children:"Learning uses"}),t("dd",{children:["the newest ",e.storage.learnSamples.toLocaleString("en-US")," outcomes",e.storage.learnScale>1?` (${e.storage.learnScale}\\xD7 \\u2014 this computer has the memory)`:""]})]}),t("dt",{children:"Disk free"}),t("dd",{class:e.storage.recordingPaused||e.storage.freeMb!==null&&e.storage.freeMb<2*e.storage.minFreeMb?"bad":"",children:[e.storage.freeMb===null?"unknown":`${(e.storage.freeMb/1e3).toFixed(1)} GB`,e.storage.recordingPaused?" \\xB7 raw recording paused (disk nearly full)":` \\xB7 kept above ${(e.storage.minFreeMb/1e3).toFixed(0)} GB`]})]})]})]}),t("div",{class:"card",children:[t("h2",{children:"Server configuration"}),t("dl",{class:"kv",children:Object.entries(e.config??{}).map(([i,l])=>t(M,{children:[t("dt",{children:i}),t("dd",{children:Array.isArray(l)?l.join(", "):String(l)})]}))})]})]}),t("div",{class:"card",children:[t("h2",{children:"Recent log"}),t("div",{class:"tablewrap",style:"max-height:340px;overflow-y:auto",children:t("table",{children:t("tbody",{children:o.map((i,l)=>t("tr",{children:[t("td",{class:"faint num",children:fe(i.ts)}),t("td",{children:t(x,{tone:i.level==="error"?"bad":i.level==="warn"?"warn":void 0,children:i.level})}),t("td",{style:"white-space:normal",children:i.msg})]},l))})})})]})]})}function Ho(){return t("div",{class:"card",style:"margin-top:12px",children:[t("h2",{children:"How it works"}),t("p",{style:"margin-top:0",children:"The bot runs on a computer that stays on \\u2014 yours, a VPS or a cloud container \\u2014 not in this page. Closing the browser or locking your phone does not stop it; Telegram keeps you posted when you are away."}),t("p",{class:"muted",style:"font-size:13px;margin-bottom:0",children:"Live orders are built by PumpPortal\'s local API (0.5% fee), signed on your computer (the key never leaves it), sent through your RPC and confirmed; the real fill is read back from the chain. Four errors in a row or the daily limit pause live entries; exits always go through. A stop loss is a market sell, not a guarantee: in a rug the fill can land far below it."})]})}function ft(e,n){try{let o=localStorage.getItem(`signal.${e}`);return o===null?n:JSON.parse(o)}catch{return n}}function An(e,n){try{localStorage.setItem(`signal.${e}`,JSON.stringify(n))}catch{}}function Fn({open:e}){let n=P(m=>m.rows),o=P(m=>m.solUsd),r=P(m=>m.settings),[a,s]=b(ft("stage","all")),[i,l]=b(ft("sort","score")),[d,p]=b(ft("minview",0)),c=r?.minScore??75,u=n.filter(m=>(a==="all"||m.stage===a)&&m.score>=d);u=[...u].sort((m,_)=>i==="new"?_.createdAt-m.createdAt:i==="mcap"?_.mcapSol-m.mcapSol:_.score-m.score);let g=n.filter(m=>m.score>=c).length,f=(m,_,v,w,T)=>t("button",{class:"chip","aria-pressed":_===m,onClick:()=>{v(m),An(w,m)},children:T});return t("div",{children:[t("div",{class:"section-title",children:[t("h2",{children:"Live radar"}),t("span",{class:"muted num",children:[n.length," coins scored \\xB7 ",t("b",{class:"flare",children:g})," at \\u2265 ",c]})]}),t("div",{class:"row wrap",style:"gap:8px;margin-bottom:12px",children:[t("div",{class:"chips",children:[f("all",a,s,"stage","All"),f("curve",a,s,"stage","Bonding curve"),f("amm",a,s,"stage","Graduated")]}),t("div",{class:"chips",children:[f("score",i,l,"sort","Top score"),f("new",i,l,"sort","Newest"),f("mcap",i,l,"sort","Market cap")]}),t("div",{class:"chips",children:[0,50,c].map(m=>t("button",{class:"chip","aria-pressed":d===m,onClick:()=>{p(m),An("minview",m)},children:m===0?"Any score":`\\u2265 ${m}`},m))})]}),u.length===0?t(D,{children:n.length===0?"Waiting for coins\\u2026 the radar fills as launches and trades stream in.":"No coins match these filters right now."}):t("div",{class:"list",children:u.map(m=>t(zo,{r:m,solUsd:o,threshold:c,onOpen:()=>e(m.mint)},m.mint))})]})}function zo({r:e,solUsd:n,threshold:o,onOpen:r}){let a=e.why.filter(i=>i.points>0).slice(0,2),s=e.why.filter(i=>i.points<0).slice(0,1);return t("button",{class:`coin ${e.held?"held":""}`,onClick:r,children:[t(ze,{value:e.score,small:e.stage==="amm"?"DEX":"CURVE"}),t("div",{class:"body",children:[t("div",{class:"title",children:[t("span",{class:"sym",children:["$",e.symbol||"?"]}),t("span",{class:"name",children:e.name}),e.held&&t(x,{tone:"flare",children:"holding"}),e.score>=o&&!e.held&&(e.spent?t(x,{children:"passed"}):t(x,{tone:"good",children:"signal"}))]}),t("div",{class:"meta num",children:[t("span",{children:ee(e.mcapSol,n)}),t("span",{children:[ae(e.ageSec)," old"]}),t("span",{class:e.net60>=0?"good":"bad",children:[e.net60>=0?"+":"",e.net60.toFixed(2)," SOL/1m"]}),t("span",{children:[e.buyers," buyers"]}),t("span",{children:["top10 ",y(e.top10)]})]}),e.stage==="curve"&&t("div",{class:"bar",title:`bonding curve ${y(e.progress)}`,children:t("i",{style:{width:`${Math.max(2,e.progress*100)}%`}})}),t("div",{class:"why",children:[a.map(i=>`\\u25B2 ${i.note||i.label}`).join("  "),s.length>0&&`  \\u25BC ${s[0].note||s[0].label}`]}),e.flags.length>0&&t("div",{class:"chips",style:"margin-top:6px",children:e.flags.slice(0,4).map(i=>t(x,{tone:/smart|leader/.test(i)?"good":/bundled|dev sold|serial|concentrated|copycat/.test(i)?"bad":void 0,children:i},i))})]})]})}function En({mint:e,close:n}){let o=P(c=>c.solUsd),r=P(c=>c.settings),[a,s]=b(null),[i,l]=b("");A(()=>{let c=!0,u=()=>k(`/api/token/${encodeURIComponent(e)}`).then(m=>c&&s(m)).catch(m=>c&&l(String(m.message??m)));u();let g=setInterval(u,3e3),f=m=>m.key==="Escape"&&n();return window.addEventListener("keydown",f),()=>{c=!1,clearInterval(g),window.removeEventListener("keydown",f)}},[e]);let d=a?.score,p=Math.max(8,...(d?.contributions??[]).map(c=>Math.abs(c.points)));return t("div",{class:"sheet-bg",onClick:c=>c.target===c.currentTarget&&n(),children:t("div",{class:"sheet",role:"dialog","aria-modal":"true","aria-label":"coin details",children:[t("div",{class:"grab"}),!a&&!i&&t(D,{children:"Loading\\u2026"}),i&&t(D,{children:i}),a&&t("div",{class:"grid",children:[t("div",{class:"row",style:"align-items:flex-start",children:[d&&t(ze,{value:d.score,small:a.stage==="amm"?"DEX":"CURVE"}),t("div",{style:"flex:1;min-width:0",children:[t("div",{style:"font-size:19px;font-weight:780",children:["$",a.symbol||"?"]}),t("div",{class:"muted",style:"overflow:hidden;text-overflow:ellipsis",children:a.name}),t("div",{class:"chips",style:"margin-top:6px",children:[t(x,{children:a.stage==="curve"?`curve ${y(a.progress)}`:a.stage==="amm"?"graduated \\xB7 PumpSwap":"migrating"}),d?.calibrated&&t(x,{tone:"good",children:["P(win) ",y(d.p)]}),a.narrative?.clusterSize>1&&t(x,{tone:a.narrative.isLeader?"good":"bad",children:[a.narrative.isLeader?"leads":"follows"," a ",a.narrative.clusterSize,"-coin narrative"]}),a.partial&&t(x,{tone:"warn",children:"joined late"})]})]}),t("button",{class:"btn ghost",onClick:n,"aria-label":"close",children:"\\u2715"})]}),t(Uo,{d:a,threshold:r?.minScore??75,enabled:!!r?.enabled}),t("div",{class:"stats",children:[t("div",{class:"stat",children:[t("div",{class:"k",children:"Market cap"}),t("div",{class:"v num",children:ee(a.mcapSol,o)}),o>0&&t("div",{class:"s num",children:[a.mcapSol.toFixed(1)," SOL"]})]}),t("div",{class:"stat",children:[t("div",{class:"k",children:"Peak"}),t("div",{class:"v num",children:ee(a.athMcapSol,o)}),t("div",{class:"s num",children:a.mcapSol>0?`${((a.mcapSol/a.athMcapSol-1)*100).toFixed(0)}% from peak`:""})]}),t("div",{class:"stat",children:[t("div",{class:"k",children:"Age"}),t("div",{class:"v num",children:ae((Date.now()-a.createdAt)/1e3)})]}),t("div",{class:"stat",children:[t("div",{class:"k",children:"Holders"}),t("div",{class:"v num",children:a.concentration?.holders??"\\u2014"}),t("div",{class:"s",children:["top10 ",y(a.concentration?.top10)]})]})]}),t("div",{class:"row wrap",style:"gap:8px",children:[N.demo?t("span",{class:"faint",style:"font-size:12.5px",children:"Simulated coin \\u2014 no explorer links in the demo."}):t(M,{children:[t("a",{class:"btn sm",href:`https://pump.fun/coin/${a.mint}`,target:"_blank",rel:"noopener",children:"pump.fun"}),t("a",{class:"btn sm",href:`https://dexscreener.com/solana/${a.mint}`,target:"_blank",rel:"noopener",children:"DexScreener"}),t("a",{class:"btn sm",href:`https://solscan.io/token/${a.mint}`,target:"_blank",rel:"noopener",children:"Solscan"}),a.meta?.twitter&&t("a",{class:"btn sm",href:a.meta.twitter,target:"_blank",rel:"noopener",children:"X / Twitter"}),a.meta?.telegram&&t("a",{class:"btn sm",href:a.meta.telegram,target:"_blank",rel:"noopener",children:"Telegram"})]}),t("button",{class:"btn sm",onClick:()=>{navigator.clipboard?.writeText(a.mint).catch(()=>{})},children:"Copy address"})]}),d&&t("div",{class:"card flat",children:[t("h3",{children:"Why this score"}),t("div",{class:"contrib",children:d.contributions.map(c=>t(M,{children:[t("div",{children:[t("div",{style:"font-weight:650",children:[c.label," ",t("span",{class:"faint num",children:["\\xB7 ",c.value]})]}),t("div",{class:"cbar","aria-hidden":"true",children:[t("span",{class:"mid"}),t("i",{style:{left:c.points>=0?"50%":`${50-Math.abs(c.points)/p*50}%`,width:`${Math.abs(c.points)/p*50}%`,background:c.points>=0?"var(--good)":"var(--bad)"}})]})]}),t("div",{class:`num ${c.points>=0?"good":"bad"}`,style:"text-align:right",children:[c.points>=0?"+":"",c.points.toFixed(1)," pts",t("div",{class:"faint",style:"font-size:11px",children:c.note})]})]}))})]}),t("div",{class:"grid two",children:[t("div",{class:"card flat",children:[t("h3",{children:"Top holders"}),a.holders.length===0?t(D,{children:"No holders tracked yet."}):t("div",{class:"tablewrap",children:t("table",{children:t("tbody",{children:a.holders.map(c=>t("tr",{children:[t("td",{class:"mono",children:t("a",{href:N.demo?void 0:`https://solscan.io/account/${c.addr}`,target:"_blank",rel:"noopener",children:ce(c.addr)})}),t("td",{children:[c.dev&&t(x,{tone:"bad",children:"dev"})," ",c.bundle&&t(x,{tone:"bad",children:"bundle"})," ",c.early&&!c.bundle&&t(x,{tone:"warn",children:"sniper"})," ",c.smart&&t(x,{tone:"good",children:"smart"})]}),t("td",{class:"r num",children:[c.pct.toFixed(2),"%"]})]},c.addr))})})})]}),t("div",{class:"card flat",children:[t("h3",{children:"Latest trades"}),t("div",{class:"tablewrap",style:"max-height:320px;overflow-y:auto",children:t("table",{children:t("tbody",{children:a.trades.map((c,u)=>t("tr",{children:[t("td",{class:"faint num",children:fe(c.ts)}),t("td",{class:c.buy?"good":"bad",children:c.buy?"buy":"sell"}),t("td",{class:"r num",children:[c.sol.toFixed(3)," SOL"]}),t("td",{class:"mono faint",children:ce(c.user)})]},u))})})})]})]}),a.creatorStats&&t("div",{class:"card flat",children:[t("h3",{children:"Dev"}),t("dl",{class:"kv",children:[t("dt",{children:"Wallet"}),t("dd",{class:"mono",children:t("a",{href:N.demo?void 0:`https://solscan.io/account/${a.creator}`,target:"_blank",rel:"noopener",children:ce(a.creator)})}),t("dt",{children:"Launches (24h / seen)"}),t("dd",{children:[a.creatorStats.launches24h," / ",a.creatorStats.launches]}),t("dt",{children:"Best previous coin"}),t("dd",{children:a.creatorStats.best?`${a.creatorStats.best.toFixed(0)} SOL mcap`:"\\u2014"}),t("dt",{children:"Dev holds / sold"}),t("dd",{children:[y(a.features?.devShare,1)," / ",y(a.features?.devSold)]})]})]}),a.positions?.length>0&&t("div",{class:"card flat",children:[t("h3",{children:"Your trades on this coin"}),a.positions.map(c=>t("div",{class:"row",style:"justify-content:space-between;padding:6px 0",children:[t("span",{children:[c.mode," \\xB7 ",c.status," ",c.exitReason?`\\xB7 ${c.exitReason}`:""]}),t("span",{class:`num ${(c.pnl??c.proceeds+c.value-c.cost)>=0?"good":"bad"}`,children:[j((c.pnl??c.proceeds+c.value-c.cost)||0)," SOL"]})]},c.id))]})]})]})})}function Uo({d:e,threshold:n,enabled:o}){let r=e.entry;if(!r)return null;let a=r.signals?.[r.signals.length-1],s=e.score?.score??0,i="",l;if(a){let d=a.decision==="entered"?"the bot bought it":a.decision==="pending"?"the bot is buying it":a.decision==="failed"?`the buy failed (${a.reason??"no fill"})`:`not bought \\u2014 ${Ye[a.reason]??a.reason}`;i=a.decision==="entered"||a.decision==="pending"?"good":"warn",l=`Entry moment at ${fe(a.ts)}, score ${Math.round(a.score)}: ${d}. Each coin gets one entry moment.`}else r.spent?l="Its entry moment has passed (before the current settings, or before this session). Each coin gets one.":s>=n?(i="good",l=o?`At your score \\u2014 buying once it holds ${r.need} evaluations in a row (${r.above}/${r.need}).`:"At your score, but auto-trading is paused."):l=`Below your score of ${n}. If it gets there and holds, that is its entry moment.`;return t("div",{class:`entrymoment ${i}`,role:"status",children:l})}var qo={tp:"take profit",sl:"stop loss",trail:"trailing stop",initials:"stake back",time:"max hold time",dead:"coin went quiet",manual:"closed by you",kill:"kill switch",external:"not in wallet"};function Rn({open:e}){let n=P(s=>s.account),o=P(s=>s.solUsd);if(!n)return t(D,{children:"Loading\\u2026"});let r=n.closed.filter(s=>s.status==="closed"),a=n.wins+n.losses>0?n.wins/(n.wins+n.losses):NaN;return t("div",{children:[t("div",{class:"section-title",children:[t("h2",{children:n.mode==="live"?"Live trading":"Paper trading"}),t("span",{class:"muted",children:n.mode==="live"?"real SOL":"simulated fills on the real order flow"})]}),t("div",{class:"card",children:[t("div",{class:"stats",children:[t(we,{k:n.mode==="live"?"Realized":"Paper equity",v:n.mode==="live"?`${j(n.realized)} SOL`:`${j(n.equity)} SOL`,s:n.mode==="live"?void 0:`cash ${j(n.paperBalance)} + open ${j(n.openValue)}${n.deposits?` \\xB7 you added ${j(n.deposits)}`:""}`}),t(we,{k:"Today",v:`${n.dayPnl>=0?"+":""}${j(n.dayPnl)} SOL`,tone:n.dayPnl>0?"good":n.dayPnl<0?"bad":""}),t(we,{k:"All time",v:`${n.realized>=0?"+":""}${j(n.realized)} SOL`,tone:n.realized>0?"good":n.realized<0?"bad":"",s:`fees paid ${j(n.fees)} SOL`}),t(we,{k:"Win rate",v:Number.isFinite(a)?`${(a*100).toFixed(0)}%`:"\\u2014",s:`${n.wins} won \\xB7 ${n.losses} lost`})]}),t("div",{style:"margin-top:10px",children:t(Yt,{points:n.equityCurve})}),n.mode!=="live"&&t(jo,{})]}),t("div",{class:"section-title",children:[t("h2",{children:"Open positions"}),t("span",{class:"muted num",children:n.open.length})]}),n.open.length===0?t(D,{children:"No open positions. When a coin reaches your score, the bot buys it here."}):t("div",{class:"list",children:n.open.map(s=>t(Wo,{p:s,solUsd:o,open:e},s.id))}),t("div",{class:"section-title",children:[t("h2",{children:"Closed"}),t("span",{class:"muted num",children:[r.length," recent"]})]}),n.closed.length===0?t(D,{children:"Closed trades appear here with their exit reason and result after fees."}):t("div",{class:"card flat",style:"padding:4px 8px",children:t("div",{class:"tablewrap",children:t("table",{children:[t("thead",{children:t("tr",{children:[t("th",{children:"Coin"}),t("th",{children:"Exit"}),t("th",{class:"r",children:"Score"}),t("th",{class:"r",children:"Held"}),t("th",{class:"r",children:"Result"})]})}),t("tbody",{children:n.closed.map(s=>t("tr",{style:"cursor:pointer",onClick:()=>e(s.mint),children:[t("td",{children:[t("b",{children:["$",s.symbol||"?"]})," ",t("span",{class:"faint",children:s.mode==="live"?"live":""})]}),t("td",{children:s.status==="failed"?t(x,{tone:"warn",children:["not filled \\xB7 ",s.exitReason]}):qo[s.exitReason??""]??s.exitReason}),t("td",{class:"r num",children:Math.round(s.signalScore)}),t("td",{class:"r num",children:s.closedAt?ae((s.closedAt-s.openedAt)/1e3):"\\u2014"}),t("td",{class:`r num ${(s.pnl??0)>0?"good":(s.pnl??0)<0?"bad":""}`,children:[s.status==="failed"?"\\u2014":`${(s.pnlPct??0)>=0?"+":""}${(s.pnlPct??0).toFixed(1)}%`,t("div",{class:"faint",style:"font-size:11px",children:s.status==="failed"?"":`${j(s.pnl??0)} SOL`})]})]},s.id))})]})})})]})}function Wo({p:e,solUsd:n,open:o}){let a=((e.cost>0?(e.proceeds+e.value)/e.cost:1)-1)*100,s=e.plan.tpPct,i=e.plan.slPct,l=s+i,d=Math.min(1,Math.max(0,(a+i)/l)),p=async()=>{try{await k(`/api/positions/${encodeURIComponent(e.id)}/close`,{}),S("Sell order sent")}catch(c){S(String(c.message))}};return t("div",{class:"card flat",children:[t("div",{class:"row",children:[t("button",{class:"btn ghost",style:"padding:0;min-height:0;text-align:left;flex:1",onClick:()=>o(e.mint),children:[t("div",{style:"font-weight:760;font-size:15px",children:["$",e.symbol||"?"," ",t("span",{class:"faint",style:"font-weight:500;font-size:12.5px",children:e.name})]}),t("div",{class:"muted num",style:"font-size:12.5px",children:[e.status==="opening"?"buying\\u2026":e.status==="closing"?"selling\\u2026":`held ${ae((Date.now()-e.openedAt)/1e3)}`," \\xB7 score ",Math.round(e.signalScore)," \\xB7 in at ",ee(e.entryMcapSol||e.signalMcapSol,n),e.tpHit?" \\xB7 trailing":""]})]}),t("div",{style:"text-align:right",children:[t("div",{class:`num ${a>=0?"good":"bad"}`,style:"font-size:19px;font-weight:780",children:e.status==="opening"?"\\u2026":`${a>=0?"+":""}${a.toFixed(1)}%`}),t("div",{class:"faint num",style:"font-size:12px",children:[j(e.cost)," SOL in"]})]})]}),t("div",{style:"margin-top:10px",children:[t("div",{class:"row faint num",style:"justify-content:space-between;font-size:11.5px",children:[t("span",{children:["SL \\u2212",i,"%"]}),t("span",{children:"entry"}),t("span",{children:["TP +",s,"%"]})]}),t("div",{class:"cbar",style:"margin-top:4px;height:10px",children:[t("span",{class:"mid",style:{left:`${i/l*100}%`}}),t("i",{style:{left:`calc(${d*100}% - 5px)`,width:"10px",background:a>=0?"var(--good)":"var(--bad)",borderRadius:"5px"}})]})]}),t("div",{class:"row",style:"justify-content:space-between;margin-top:10px",children:[t("span",{class:"faint",style:"font-size:12px",children:e.notes.slice(-1)[0]??`opened ${Q(e.openedAt)}`}),t("button",{class:"btn sm",disabled:e.status!=="open",onClick:p,children:"Sell now"})]})]})}function jo(){let[e,n]=b("1000"),[o,r]=b(!1),a=async()=>{r(!0);try{let s=await k("/api/paper/add",{sol:Number(e)});S(`Added ${Number(e).toLocaleString("en-US")} paper SOL \\u2014 cash now ${j(s.paperBalance)} SOL`),q()}catch(s){S(String(s.message))}finally{r(!1)}};return t("div",{style:"margin-top:10px",children:[t("p",{class:"muted",style:"margin:0 0 6px;font-size:13px",children:"Paper money running low? Top it up \\u2014 your history and results stay (the chart shows results only)."}),t("div",{class:"row",style:"gap:8px",children:[t("input",{class:"inp",style:"max-width:110px",inputMode:"decimal","aria-label":"paper SOL to add",value:e,onInput:s=>n(s.target.value)}),t("button",{class:"btn sm",disabled:o||!(Number(e)>0),onClick:a,children:o?"Adding\\u2026":"Add paper SOL"})]})]})}var Cn=[["radar","Radar"],["trades","Trades"],["bot","Bot"],["learn","Learn"],["more","More"]],On=e=>Cn.some(([n])=>n===e);function Vo(){let e=location.hash.replace("#","");return On(e)?e:"radar"}function Ko(){let[e,n]=b(""),[o,r]=b(""),[a,s]=b(!1);return t("div",{class:"login",children:[t("div",{class:"brand",style:"font-size:15px;margin-bottom:18px",children:[t(Nn,{})," SIGNAL"]}),t("form",{class:"card",onSubmit:async l=>{l.preventDefault(),s(!0),r("");try{await k("/api/login",{token:e}),await q(),He()}catch(d){r(String(d.message))}finally{s(!1)}},children:[t("h2",{children:"Unlock the dashboard"}),t("p",{class:"muted",style:"margin-top:0",children:"Enter the access token printed in the server log on first start (or your DASHBOARD_TOKEN)."}),t("input",{id:"token",class:"inp",style:"max-width:none",type:"password",autoComplete:"current-password",placeholder:"access token",value:e,onInput:l=>n(l.target.value)}),o&&t("p",{class:"bad",style:"margin:8px 0 0",children:o}),t("button",{class:"btn primary",style:"margin-top:12px;width:100%",disabled:a||!e,children:a?"Checking\\u2026":"Unlock"})]})]})}function Nn(){return t("svg",{width:"22",height:"22",viewBox:"0 0 32 32","aria-hidden":"true",children:[t("rect",{width:"32",height:"32",rx:"7",fill:"var(--ink)"}),t("path",{d:"M6 22 L12 14 L17 18 L26 8",stroke:"var(--flare)","stroke-width":"3.2",fill:"none","stroke-linecap":"round","stroke-linejoin":"round"})]})}function Go({health:e}){let n=e.feeds.filter(s=>s.critical&&s.status!=="off");if(e.uptimeSec<60&&n.some(s=>s.status==="connecting"||s.status==="open"&&!s.msgs))return t("div",{class:"banner sim",children:"Connecting to the live market data\\u2026"});let o=n.map(s=>s.note).find(s=>!!s)??"",r=n.some(s=>/solana\\.com$/i.test(s.host??"")),a=/\\b429\\b/.test(o)?r?"The free public feed is limiting this connection; it retries by itself. If it keeps happening, stream through your own key (More \\u2192 Setup).":"The data provider is limiting requests (plan limit reached?).":/\\b40[13]\\b/.test(o)?r?"The free public feed refused the connection; it retries by itself.":"The data provider refused the key: paste it again in More \\u2192 Setup.":o?`Reason: ${o}`:"";return t("div",{class:"banner bad",children:[t("span",{style:"flex:1",children:["Live data feed is down \\u2014 the bot will not open trades until it recovers.",a&&t("span",{style:"font-weight:500",children:[" ",a]})]}),t("button",{class:"btn sm",onClick:()=>ue("more","health"),children:"Details"})]})}function Dn(){let e=P(m=>m.authed),n=P(m=>m.settings),o=P(m=>m.account),r=P(m=>m.health),a=P(m=>m.connected),s=P(m=>m.toast),i=P(m=>m.nav),[l,d]=b(Vo()),[p,c]=b(null);if(A(()=>{i&&On(i.tab)&&(d(i.tab),c(null),window.scrollTo({top:0}))},[i?.at]),A(()=>{q().then(()=>{lt().authed&&He()});let m=setInterval(()=>void q(),15e3),_=()=>{document.visibilityState==="visible"&&q().then(()=>lt().authed&&He())};return document.addEventListener("visibilitychange",_),()=>{clearInterval(m),Gt(),document.removeEventListener("visibilitychange",_)}},[]),e===!1&&!N.demo)return t(Ko,{});if(e!==!0||!n)return t("div",{class:"empty",style:"margin-top:30vh",children:N.demo?"Starting the simulated market\\u2026":"Connecting to SIGNAL\\u2026"});let u=!r?.feedDown,g=m=>{d(m);try{history.replaceState(null,"",`#${m}`)}catch{}window.scrollTo({top:0})},f=o?.dayPnl??0;return t("div",{class:"app",children:[t("header",{class:"top",children:t("div",{class:"top-row",children:[t("div",{class:"brand",children:[t(Nn,{})," SIGNAL"]}),t("span",{class:"pill",title:u?"data feeds live":"data feed down",children:[t("span",{class:`dot ${a?u?"on":"off":"mid"}`}),n.enabled?"Trading":"Paused"," \\xB7 ",n.mode==="live"?"LIVE":"paper"]}),t("span",{class:"spacer"}),t("span",{class:`top-pnl num ${f>0?"good":f<0?"bad":"muted"}`,title:"today, SOL",children:[jt(f)," SOL"]})]})}),r?.simulated&&t("div",{class:"banner sim",children:[t("span",{style:"flex:1",children:N.demo?"DEMO \\u2014 the real engine on a simulated market in this page. Fake coins, fake money.":"SIMULATED MARKET \\u2014 demo data, not real coins or prices."}),N.bannerAction?.()]}),o?.killed&&t("div",{class:"banner bad",children:"Kill switch is ON \\u2014 no new entries."}),r&&r.feedDown&&!r.simulated&&t(Go,{health:r}),!N.demo&&(r?.saved?.failures??0)>=3&&t("div",{class:"banner bad",children:t("span",{style:"flex:1",children:["Settings and trades are not being saved (",r.saved.error,"). Check that the bot\'s folder is not read-only, full, or synced by OneDrive."]})}),!N.demo&&r?.update?.available&&r.update.can&&t("div",{class:"banner info",children:[t("span",{style:"flex:1",children:"A new version of SIGNAL is ready."}),t("button",{class:"btn sm",onClick:()=>ue("more","setup"),children:"Update"})]}),t("nav",{class:"tabs","aria-label":"sections",children:Cn.map(([m,_])=>t("button",{class:"tab","aria-current":l===m?"page":void 0,onClick:()=>g(m),children:[Xt[m],_]},m))}),t("main",{class:"main",children:[l==="radar"&&t(Fn,{open:c}),l==="trades"&&t(Rn,{open:c}),l==="bot"&&t(vn,{}),l==="learn"&&t(Tn,{}),l==="more"&&t(Ln,{open:c})]}),p&&t(En,{mint:p,close:()=>c(null)}),s&&t("div",{class:"toast",role:"status",children:s})]})}V({});Rt(t(Dn,{}),document.getElementById("root"));})();\n</script>\n</body>\n</html>\n';
  const here = dirname2(fileURLToPath(import.meta.url));
  for (const p of [join6(here, "dashboard.html"), join6(here, "../dist/dashboard.html"), join6(process.cwd(), "dist/dashboard.html")]) {
    if (existsSync7(p)) return readFileSync8(p, "utf8");
  }
  return "<!doctype html><title>SIGNAL</title><p>Dashboard not built. Run <code>npm run build</code>.</p>";
}
var AlreadyRunning = class extends Error {
  constructor(port, dataDir) {
    super(`SIGNAL is already running on this computer (port ${port}).`);
    this.port = port;
    this.dataDir = dataDir;
  }
};
async function answersAsSignal(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(1500) });
    const j = await r.json();
    return r.ok && j.ok === true && (j.app === "signal" || typeof j.uptime === "number");
  } catch {
    return false;
  }
}
var ago2 = (t) => {
  const m = Math.round((Date.now() - t) / 6e4);
  return m < 1 ? "just now" : m < 120 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};
async function main() {
  loadDotEnv();
  const baseEnv = { ...process.env };
  const setup = new SetupStore(resolve2(process.env.DATA_DIR ?? "./data"));
  setup.applyTo(process.env);
  const effective = (k) => setup.read()[k] ?? baseEnv[k] ?? "";
  const config = loadConfig();
  if (await answersAsSignal(config.port)) throw new AlreadyRunning(config.port, config.dataDir);
  const log = new ServerLog(config.logLevel);
  const store = new DataStore(config.dataDir, log);
  let token = config.dashboardToken || store.readSecret() || "";
  if (!token) {
    token = randomBytes(18).toString("base64url");
    store.writeSecret(token);
  }
  const model = store.loadModel() ?? priorModel(Date.now());
  let server = null;
  let learner = null;
  let telegram = null;
  let live = null;
  let pumpportal = null;
  let metadata = null;
  let pools = null;
  let updater = null;
  const engine = new Engine({
    now: Date.now(),
    model,
    log,
    config: {
      paperStartSol: Number(process.env.PAPER_START_SOL ?? 10) || 10,
      maxWallets: Math.max(5e3, Number(process.env.MAX_WALLETS ?? 8e4) || 8e4),
      // every resolved sample is on disk; memory only keeps a recent window
      maxSamplesInMemory: 1e4
    },
    hooks: {
      persist: (s) => store.saveState(s),
      journal: (j) => store.journal(j),
      onSample: (s) => store.sample(s),
      onSignal: (rec) => server?.broadcast("signal", rec),
      onSettings: (s, why) => {
        server?.broadcast("settings", s);
        learner?.onSettings(s, why);
      },
      onModel: (m) => {
        try {
          store.saveModel(m);
        } catch (e) {
          log.warn("model save failed", { err: String(e) });
        }
      },
      onPosition: (p, what) => {
        server?.broadcast("position", { position: p, what });
        telegram?.onPosition(p, what);
        if (what === "close" && p.mode === "live") live?.notePnl(p.pnl ?? 0, p.closedAt ?? Date.now());
      },
      needMeta: (mint, uri) => metadata?.request(mint, uri),
      needPool: (pool) => pools?.request(pool),
      watchMint: (mint, on) => pumpportal?.watch(mint, on)
    }
  });
  const saved = store.loadState();
  if (saved) {
    engine.restore(saved);
    const s = engine.settings;
    log.info(
      `Settings restored from ${config.dataDir} (saved ${ago2(saved.savedAt)}): ${ruleSummary(s)} \xB7 auto-trading ${s.enabled ? "ON" : "off"} \xB7 ${engine.closed.length} closed trades`
    );
  } else {
    log.warn(`No saved settings in ${config.dataDir} \u2014 starting with the defaults. If you set the bot up before, it was in another folder.`);
  }
  const wallets = store.loadWallets();
  if (wallets) engine.wallets.restore(wallets);
  if (config.liveTrading && config.walletSecret) {
    live = new LiveExecutor({
      walletSecret: config.walletSecret,
      rpcHttp: config.rpcHttp,
      maxPositionSol: config.liveMaxPositionSol,
      maxDailyLossSol: config.liveMaxDailyLossSol,
      log,
      engine: () => engine,
      onAlert: (m) => telegram?.send(m)
    });
    engine.executor = live;
    live.start();
    for (const p of [...engine.positions.values()].filter((x) => x.mode === "live")) {
      live.rpc.tokenBalance(live.wallet?.address ?? "", p.mint).then((bal) => engine.reconcile(p.id, bal)).catch((e) => log.warn("live reconcile failed", { mint: p.mint, err: String(e) }));
    }
  } else if (engine.settings.mode === "live") {
    log.warn("settings asked for LIVE mode but the server has live trading disabled \u2014 switching to paper");
    engine.updateSettings({ mode: "paper" });
  }
  let rpc = null;
  const version = readVersion(findInstallDir(dirname2(fileURLToPath(import.meta.url))) ?? ".");
  const dataSource = () => {
    if (config.feeds.has("sim")) return "simulated market";
    if (!config.feeds.has("rpc")) return [...config.feeds].join(", ");
    if (config.streamSource !== "rpc") return "free public Solana feed";
    return rpc?.health.budget?.onFree ? `free public feed (your key's ${config.streamBudgetMb} MB for today are used)` : `your RPC key (up to ${config.streamBudgetMb} MB a day)`;
  };
  const rpcHealthy = () => !!rpc && rpc.health.status === "open" && Date.now() - rpc.health.lastMsgAt < 2e4;
  const router = new EventRouter((ev) => {
    engine.ingest(ev);
    if (config.record) {
      try {
        store.record(ev, ev.ts);
      } catch (e) {
        log.error("record failed", { err: String(e) });
      }
    }
  }, rpcHealthy);
  const onHealth = (h) => engine.setFeedHealth(h);
  const feeds = [];
  if (config.feeds.has("sim")) {
    const sim = new SimFeed({ log, speed: config.simSpeed, predictability: config.simPredictability, onEvent: (ev) => router.push(ev), onHealth });
    sim.start();
    feeds.push(sim);
  }
  if (config.feeds.has("rpc")) {
    const metered = config.streamSource === "rpc";
    rpc = new RpcLogsFeed({
      url: config.streamWs,
      // through a key billed per MB: a daily cap, then the free public feed until 00:00 UTC
      fallbackUrl: metered ? PUBLIC_RPC_WS : void 0,
      budgetMb: metered ? config.streamBudgetMb : 0,
      budgetFile: join6(config.dataDir, "stream-usage.json"),
      onBudgetSpent: (mb) => telegram?.send(`\u{1F4C9} Today's ${mb} MB of streaming through your RPC key is used. SIGNAL switched to the free public feed until 00:00 UTC, so your key's credits stop here.`),
      ammFirehose: config.ammFirehose,
      followPools: () => engine.poolsToFollow(),
      log,
      onEvent: (ev) => router.push(ev),
      onHealth
    });
    rpc.start();
    feeds.push(rpc);
    pools = new PoolResolver({ rpcHttp: config.rpcHttp, log, onResolved: (pool, mint) => engine.mapPool(pool, mint) });
  }
  if (config.feeds.has("pumpportal")) {
    pumpportal = new PumpPortalFeed({ apiKey: config.pumpPortalApiKey, critical: !config.feeds.has("rpc"), log, onEvent: (ev) => router.push(ev), onHealth });
    pumpportal.start();
    feeds.push(pumpportal);
  }
  if (config.feeds.has("dexscreener")) {
    const dex = new DexScreenerFeed({
      log,
      onEvent: (ev) => router.push(ev),
      onHealth,
      watchlist: () => {
        const held = [...engine.positions.values()].map((p) => p.mint);
        const top = engine.radar({ limit: 40, stage: "amm" }).map((r) => r.mint);
        return [...held, ...top];
      }
    });
    dex.start();
    feeds.push(dex);
  }
  if (config.metadata && !config.feeds.has("sim")) metadata = new MetadataFetcher({ log, onEvent: (ev) => router.push(ev) });
  const solPrice = new SolPrice(log, (usd) => engine.solUsd = usd);
  if (!config.feeds.has("sim")) solPrice.start();
  else engine.solUsd = 200;
  let lagMs = 0;
  let lastTick = Date.now();
  let lastSleepWarn = 0;
  const clock = setInterval(() => {
    const now = Date.now();
    const gap = now - lastTick;
    lagMs = Math.max(0, gap - 100);
    if (gap > 6e4 && now - lastSleepWarn > 36e5) {
      lastSleepWarn = now;
      const min = Math.round(gap / 6e4);
      log.warn(`the computer was asleep for ${min} min \u2014 the bot missed that time`);
      telegram?.send(`\u{1F634} The computer running SIGNAL was asleep for ${min} min, so the bot missed that time. Turn sleep off: Windows Settings \u2192 System \u2192 Power \u2192 Sleep \u2192 Never.`);
    }
    lastTick = now;
    engine.advance(now);
  }, 100);
  let diskMb = store.diskUsageMb();
  const limitOf = (r) => config.dataMaxGb !== null ? config.dataMaxGb * 1e3 : autoDataMaxMb(r.usedMb, r.freeMb);
  const first = store.storageReport();
  const budget = { maxMb: limitOf(first), minFreeMb: config.minFreeGb * 1e3, keepSampleDays: 3 };
  const learnScale = sampleScale();
  const describeStorage = () => ({ ...store.storageReport(), maxMb: budget.maxMb, minFreeMb: budget.minFreeMb, auto: config.dataMaxGb === null, learnScale, learnSamples: Object.values(sampleLimits(learnScale)).reduce((a, b) => a + b, 0) });
  let storage = describeStorage();
  let prunedNoted = 0;
  const keepRoom = () => {
    try {
      budget.maxMb = limitOf(store.storageReport());
      const r = store.enforceBudget(budget);
      storage = describeStorage();
      diskMb = storage.usedMb;
      const gb = (mb) => `${((mb ?? 0) / 1e3).toFixed(1)} GB`;
      if (r.deleted) log.info("storage: deleted old data to stay within budget", { files: r.deleted, freedMb: r.freedMb, samples: r.samplesPruned });
      if (r.paused) {
        log.warn("storage: disk nearly full \u2014 raw recording paused", { freeMb: storage.freeMb });
        telegram?.send(`\u26A0\uFE0F The disk is nearly full (${gb(storage.freeMb)} free). Raw market recording is paused \u2014 trading and learning go on. Free some space on the disk, or lower DATA_MAX_GB.`);
      }
      if (r.resumed) telegram?.send(`\u2705 The disk has room again (${gb(storage.freeMb)} free): raw market recording resumed.`);
      if (r.samplesPruned && Date.now() - prunedNoted > 24 * 36e5) {
        prunedNoted = Date.now();
        telegram?.send(`\u{1F9F9} Storage: old recorded outcomes were deleted to stay within ${gb(budget.maxMb)} with ${gb(budget.minFreeMb)} of the disk free (the newest 3 days are always kept; learning uses the newest). Raise DATA_MAX_GB to keep more.`);
      }
    } catch (e) {
      log.warn("storage check failed", { err: String(e) });
    }
  };
  const hk = setInterval(() => {
    try {
      store.saveWallets(engine.wallets.snapshot());
    } catch (e) {
      log.warn("wallet snapshot failed", { err: String(e) });
    }
    keepRoom();
  }, 10 * 6e4);
  const heapLimit = getHeapStatistics2().heap_size_limit;
  const boxed = process.constrainedMemory?.() ?? 0;
  const boxLimit = boxed > 0 && boxed < 64e9 ? boxed : 0;
  const memGuard = setInterval(() => {
    const { heapUsed, rss } = process.memoryUsage();
    if (heapUsed < heapLimit * 0.7 && !(boxLimit && rss > boxLimit * 0.8)) return;
    const before = engine.wallets.size;
    const dropped = engine.wallets.trim(0.5);
    log.warn("memory high: trimmed wallet book", { heapMb: Math.round(heapUsed / 1e6), rssMb: Math.round(rss / 1e6), limitMb: Math.round((boxLimit || heapLimit) / 1e6), before, dropped });
  }, 3e4);
  const daily = setInterval(() => {
    store.cleanup(config.recordDays, config.sampleDays);
    keepRoom();
    store.backupState();
  }, 36e5);
  store.cleanup(config.recordDays, config.sampleDays);
  keepRoom();
  store.backupState();
  learner = new Learner({
    store,
    engine: () => engine,
    log,
    everyHours: config.learnEveryHours,
    sampleDays: config.sampleDays,
    onAdopt: (m) => telegram?.send(m),
    onTune: (m) => telegram?.send(m),
    onEdges: (m) => telegram?.send(m),
    onDrift: (m) => telegram?.send(m),
    onAutopilot: (m) => telegram?.send(m),
    onCheck: (m) => telegram?.send(m),
    onLab: (m) => telegram?.send(m),
    storage: () => storage
  });
  learner.start();
  const startTelegram = () => {
    telegram?.stop();
    const chat = effective("TELEGRAM_CHAT_ID");
    telegram = new Telegram({
      token: effective("TELEGRAM_BOT_TOKEN"),
      chatId: chat === "none" ? "" : chat,
      linkCode: setup.read().TELEGRAM_LINK_CODE,
      onLinked: (id) => {
        setup.write({ TELEGRAM_CHAT_ID: id, TELEGRAM_LINK_CODE: "" });
        log.info("telegram chat linked");
      },
      about: () => ({ version, update: !!updater?.available, data: dataSource() }),
      strategies: () => strategyList(learner.lastEdges),
      edges: () => ({ report: learner.lastEdges, running: learner.edgesRunning }),
      learning: () => server?.learning() ?? null,
      autopilot: () => learner?.autopilotView() ?? null,
      checks: () => learner?.checksView() ?? null,
      lab: () => learner?.labView() ?? null,
      labIdea: (text) => learner.addLabIdea(text),
      links: () => {
        const out = [];
        const lanIp = lanAddress();
        const tail = tailscaleAddress();
        if (tail) out.push({ label: "Anywhere (Tailscale on)", url: `http://${tail}:${config.port}/?token=${token}` });
        if (lanIp) out.push({ label: "At home (same Wi-Fi)", url: `http://${lanIp}:${config.port}/?token=${token}` });
        return out;
      },
      update: () => {
        const st = updater?.status();
        if (!updater || !st?.can) return st?.why ?? "This bot cannot update itself.";
        void updater.apply().then((r) => {
          if (!r.ok) telegram?.send(`\u26A0\uFE0F ${r.error}`);
          else if (r.upToDate) telegram?.send("\u2705 SIGNAL is already up to date.");
          else if (!r.restarting) telegram?.send("\u2705 Update installed. Close the bot window and start it again to use it.");
        });
        return "\u2B07\uFE0F Downloading the update. The bot restarts by itself in about a minute and says hello when it is back.";
      },
      log,
      engine: () => engine
    });
    telegram.start();
  };
  startTelegram();
  let shutdownRef = () => {
  };
  const restart = () => {
    if (process.env.SIGNAL_SUPERVISED !== "1") return false;
    setTimeout(() => shutdownRef(75), 500);
    return true;
  };
  updater = new Updater({
    installDir: findInstallDir(dirname2(fileURLToPath(import.meta.url))),
    selfUpdate: process.env.SIGNAL_SELF_UPDATE === "1" && process.env.SIGNAL_SUPERVISED === "1",
    log,
    restart,
    notedFile: join6(config.dataDir, "update-noted"),
    // the official download unless overridden (tests)
    zipUrl: process.env.SIGNAL_UPDATE_ZIP_URL || void 0,
    versionUrl: process.env.SIGNAL_UPDATE_VERSION_URL || void 0,
    onAvailable: () => telegram?.send("\u2B06\uFE0F <b>A SIGNAL update is ready.</b>\nSend /update to install it, or tap Update in the dashboard (More \u2192 Setup). The bot restarts by itself in about a minute.")
  });
  updater.start();
  server = new DashboardServer({
    engine: () => engine,
    store,
    config,
    log,
    learner,
    live: () => live,
    token,
    setup,
    effective,
    restart,
    updater,
    reloadTelegram: startTelegram,
    port: config.port,
    dashboardHtml,
    extraHealth: () => ({
      loopLagMs: lagMs,
      diskMb,
      router: { duplicates: router.duplicates, dropped: router.dropped },
      rpcFeed: rpc ? { decoded: rpc.decoded, truncated: rpc.truncated, failedTx: rpc.failedTx } : null,
      metadata: metadata ? { fetched: metadata.fetched, failed: metadata.failed } : null,
      pools: pools ? { resolved: pools.resolved } : null,
      simulated: config.feeds.has("sim"),
      dataDir: config.dataDir,
      update: updater ? { current: updater.current, available: updater.available, can: updater.can } : null,
      storage
    })
  });
  await server.listen(config.port, config.host);
  const shown = config.dashboardToken ? "(from DASHBOARD_TOKEN)" : token;
  const lan = lanAddress();
  log.info("================================================================");
  log.info(`SIGNAL running \u2014 dashboard on port ${config.port}`);
  log.info(`On this computer: http://localhost:${config.port}  (no token needed)`);
  if (lan) log.info(`On your phone at home (same Wi-Fi): http://${lan}:${config.port}/?token=${config.dashboardToken ? "<your DASHBOARD_TOKEN>" : token}`);
  const tailnet = tailscaleAddress();
  if (tailnet) log.info(`On your phone anywhere (Tailscale): http://${tailnet}:${config.port}/?token=${config.dashboardToken ? "<your DASHBOARD_TOKEN>" : token}`);
  log.info(`Access token ${shown}`);
  log.info(`Feeds: ${[...config.feeds].join(", ")} \xB7 mode ${engine.settings.mode} \xB7 auto-trading ${engine.settings.enabled ? "ON" : "off"}`);
  if (config.feeds.has("rpc")) {
    const host = (() => {
      try {
        return new URL(config.streamWs).host;
      } catch {
        return "invalid address";
      }
    })();
    log.info(
      `Market data: ${config.streamSource === "rpc" ? `through your RPC key (${host}), up to ${config.streamBudgetMb} MB a day` : `free public Solana feed (${host})`}${config.ammFirehose ? " \xB7 every PumpSwap swap" : ""}`
    );
  }
  if (config.feeds.has("sim")) log.warn("SIMULATION MODE: all coins and prices are synthetic");
  log.info("================================================================");
  let stopping = false;
  const shutdown = (code) => {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    log.info("shutting down \u2014 saving state");
    try {
      engine.persistNow();
      store.saveWallets(engine.wallets.snapshot());
    } catch (e) {
      log.error("final save failed", { err: String(e) });
    }
    clearInterval(clock);
    clearInterval(hk);
    clearInterval(daily);
    clearInterval(memGuard);
    for (const f2 of feeds) f2.stop();
    solPrice.stop();
    learner.stop();
    updater?.stop();
    telegram?.stop();
    live?.stop();
    server?.close();
    store.close();
    setTimeout(() => process.exit(code), 300).unref();
  };
  shutdownRef = shutdown;
  if (process.env.SIGNAL_OPEN_BROWSER === "1") openBrowser(`http://localhost:${config.port}/`, config.dataDir);
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
  process.on("SIGHUP", () => shutdown(0));
  process.on("SIGBREAK", () => shutdown(0));
  process.on("unhandledRejection", (e) => log.error("unhandled rejection", { err: String(e) }));
  process.on("uncaughtException", (e) => {
    log.error("uncaught exception \u2014 saving state and restarting", { err: String(e), stack: e.stack });
    shutdown(1);
  });
  return { engine, server, store, shutdown };
}
var isEntry = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();
if (isEntry || true) {
  main().catch((e) => {
    if (e instanceof AlreadyRunning) {
      console.log(`
  ${e.message}
  Its window may be minimized on the taskbar. Dashboard: http://localhost:${e.port}
`);
      if (process.env.SIGNAL_OPEN_BROWSER === "1") openBrowser(`http://localhost:${e.port}/`, e.dataDir);
      setTimeout(() => process.exit(74), 500);
      return;
    }
    console.error("SIGNAL failed to start:", e);
    process.exit(1);
  });
}
export {
  AlreadyRunning,
  main
};
