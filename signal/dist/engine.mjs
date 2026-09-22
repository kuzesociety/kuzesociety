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
import { existsSync as existsSync4, readFileSync as readFileSync5 } from "node:fs";
import { dirname, join as join4, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";
import { getHeapStatistics } from "node:v8";

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
  stage_off: "This stage is turned off in settings",
  non_sol_quote: "Coin is not paired with SOL",
  already_traded: "Already traded this coin (re-entry off)",
  max_open: "Max open positions reached",
  pending: "An order for this coin is already in flight",
  daily_loss_limit: "Daily loss limit reached",
  rate_limit: "Max trades per hour reached",
  feed_down: "Live data feed is down \u2014 not trading blind",
  warming_up: "Learning this market's score scale (first minutes after install)",
  insufficient_balance: "Not enough SOL in the wallet",
  slippage: "Price moved more than your slippage before the buy landed",
  migrating: "Coin is migrating to PumpSwap (not tradable for a moment)",
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
  return clamp(50 + (zLogit - logit(stage.pRef)) * POINTS_PER_LOGIT, 0, 100);
}
function scoreToken(model, f2, explain = true) {
  const stageKey = f2.stage;
  const stage = model.stages[stageKey];
  const x = featureVector(f2);
  const z = standardize(stage, x);
  const lin = linear(stage, z);
  const pLogit = stage.calib ? stage.calib.a + stage.calib.b * lin : lin;
  const p = sigmoid(pLogit);
  const score = scoreFromLogit(stage, pLogit);
  let contributions = [];
  if (explain) {
    for (let i = 0; i < FEATURE_DEFS.length; i++) {
      const d = FEATURE_DEFS[i];
      const w = stage.weights[d.key] ?? 0;
      if (w === 0) continue;
      const pts = w * z[i] * POINTS_PER_LOGIT;
      if (Math.abs(pts) < 0.5) continue;
      contributions.push({ key: d.key, label: d.label, value: d.show(f2), points: pts, note: pts > 0 ? d.good : d.bad });
    }
    contributions.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
    contributions = contributions.slice(0, 10);
  }
  return { score, p, calibrated: !!stage.calib && model.source === "trained", stage: stageKey, contributions };
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
      f: facts
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
var DEFAULT_SETTINGS = {
  enabled: false,
  mode: "paper",
  minScore: 75,
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
  return out;
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
      equity: [{ t: opts.now, v: this.paperBalance }]
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
      e = { res, f: f2, x, at: now, above: 0, armed: true, lastFunnelAt: 0, reached: 0, held: new Uint8Array(ENTRY_LEVELS.length) };
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
  checkpoints(t, e, now) {
    const custom = { tp: this.settings.tpPct, sl: this.settings.slPct };
    const add = (tag) => {
      if (!this.outcomes.has(t.mint, tag)) this.outcomes.add(t, "checkpoint", tag, now, e.res.score, e.res.p, e.x, custom);
    };
    if (t.stage === "curve") {
      const age = (now - t.createdAt) / 1e3;
      if (t.partial) return;
      let tag = null;
      for (const s of this.cfg.checkpointsCurveSec) if (age >= s && age < s * 1.6) tag = `age${s}`;
      if (tag) add(tag);
      for (const p of this.cfg.checkpointsProgress) if (t.progress >= p && t.progress < p + 0.1) add(`prog${Math.round(p * 100)}`);
    } else if (t.stage === "amm" && t.migrateAt) {
      const since = (now - t.migrateAt) / 1e3;
      for (const s of this.cfg.checkpointsAmmSec) if (since >= s && since < s * 1.6) add(`mig${s}`);
    }
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
    const score = e.res.score;
    if (score >= s.minScore) e.above++;
    else {
      e.above = 0;
      if (s.reentry && score < s.minScore - 5) e.armed = true;
    }
    if (!e.armed || e.above < s.confirmTicks) return;
    e.armed = false;
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
    const blocked = this.entryBlock(t, e);
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
  entryBlock(t, e) {
    const s = this.settings;
    if (!s.enabled) return "bot_off";
    if (this.killed) return "kill_switch";
    if (t.nonSol) return "non_sol_quote";
    if (t.stage === "curve" && !s.tradeCurve || t.stage === "amm" && !s.tradeAmm) return "stage_off";
    if (t.stage === "migrating") return "migrating";
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
    if (!this.modelReady()) return "warming_up";
    if (s.mode === "live") {
      if (!this.executor || !this.executor.ready()) return "live_disabled";
    } else if (this.paperBalance < s.positionSol * LAMPORTS_PER_SOL) return "insufficient_balance";
    if (s.scoreOnly) return null;
    const f2 = s.filters;
    const raw = e.f;
    if (f2.minMcapSol > 0 && t.mcapSol < f2.minMcapSol) return "filter:mcap_min";
    if (f2.maxMcapSol > 0 && t.mcapSol > f2.maxMcapSol) return "filter:mcap_max";
    if (raw.devShare * 100 > f2.maxDevPct) return "filter:dev";
    if (raw.top10 * 100 > f2.maxTop10Pct) return "filter:top10";
    if (raw.bundleShare * 100 > f2.maxBundlePct) return "filter:bundle";
    if (raw.uniqTotal < f2.minBuyers) return "filter:buyers";
    if (f2.minAgeSec > 0 && raw.ageSec < f2.minAgeSec) return "filter:age_min";
    if (f2.maxAgeMin > 0 && raw.ageSec > f2.maxAgeMin * 60) return "filter:age_max";
    if (f2.requireSocials && raw.socials === 0) return "filter:socials";
    if (f2.maxDevLaunches24h > 0 && raw.creatorLaunches24h > f2.maxDevLaunches24h) return "filter:serial_dev";
    if (f2.maxDevSoldPct < 100 && raw.devSold * 100 > f2.maxDevSoldPct) return "filter:dev_sold";
    return null;
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
    this.stats.equity.push({ t: ts, v: this.paperBalance });
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
  updateSettings(patch) {
    const prev = this.settings;
    const next = sanitizeSettings(patch, prev);
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
    this.hooks.onSettings?.(next);
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
      const bias = base.bias - lm * k;
      this.model.stages[stage] = { ...cur, mean: mean2, std, weights, bias, pRef: base.pRef };
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
    } catch (e) {
      this.log.error("persist failed", { err: String(e) });
      this.persistDirty = true;
    }
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
  const rpcHttp = env.RPC_URL ?? env.RPC_HTTP_URL ?? "https://api.mainnet-beta.solana.com";
  const rpcWs = env.RPC_WS_URL ?? rpcHttp.replace(/^http/, "ws");
  const level = env.LOG_LEVEL ?? "info";
  return {
    port: n(env.PORT, 8787),
    host: env.HOST ?? "0.0.0.0",
    dataDir: resolve(env.DATA_DIR ?? "./data"),
    dashboardToken: env.DASHBOARD_TOKEN ?? "",
    rpcWs,
    rpcHttp,
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
    learnEveryHours: n(env.LEARN_EVERY_HOURS, 6),
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
    rpcIsPublic: /api\.mainnet-beta\.solana\.com/.test(c.rpcHttp),
    pumpPortalApiKey: hide(c.pumpPortalApiKey),
    telegram: c.telegramToken && c.telegramChatId ? "on" : "off",
    liveTrading: c.liveTrading ? "enabled by server" : "disabled by server",
    wallet: c.walletSecret ? "configured" : "none",
    liveMaxPositionSol: c.liveMaxPositionSol,
    liveMaxDailyLossSol: c.liveMaxDailyLossSol,
    recording: c.record ? `on (${c.recordDays} days kept)` : "off",
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
var BASE = "https://api.dexscreener.com";
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
      const rows = await getJson(BASE + path);
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
      const pairs = await getJson(`${BASE}/tokens/v1/solana/${chunk.join(",")}`);
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
  setStatus(s, note) {
    this.h.status = s;
    if (note !== void 0) this.h.note = note;
    try {
      this.o.onHealth?.({ ...this.h });
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
    this.setStatus("connecting");
    let ws;
    try {
      ws = new wrapper_default(url, { handshakeTimeout: 15e3, perMessageDeflate: false, maxPayload: 16 * 1024 * 1024 });
    } catch (e) {
      this.h.errors++;
      this.schedule(`connect threw: ${String(e)}`);
      return;
    }
    this.ws = ws;
    ws.on("open", () => {
      this.attempts = 0;
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
      this.o.log.warn(`${this.o.name}: socket error`, { err: String(e.message ?? e) });
    });
    ws.on("close", (code, reason) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      this.schedule(`closed ${code}${reason?.length ? " " + reason.toString().slice(0, 80) : ""}`);
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
    this.o.log.warn(`${this.o.name}: ${why}; retry in ${(delay / 1e3).toFixed(1)}s`);
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
var RpcLogsFeed = class {
  constructor(o) {
    this.o = o;
    this.ws = new ReconnectingWS({
      name: "solana-rpc",
      url: () => o.url,
      critical: true,
      staleMs: 45e3,
      pingMs: 15e3,
      log: o.log,
      onHealth: o.onHealth,
      onOpen: (send) => {
        const commitment = o.commitment ?? "processed";
        send({ jsonrpc: "2.0", id: 1, method: "logsSubscribe", params: [{ mentions: [PUMP_PROGRAM] }, { commitment }] });
        send({ jsonrpc: "2.0", id: 2, method: "logsSubscribe", params: [{ mentions: [PUMP_AMM_PROGRAM] }, { commitment }] });
      },
      onMessage: (text) => this.onMessage(text)
    });
  }
  ws;
  seen = new LRU(5e4);
  truncated = 0;
  failedTx = 0;
  decoded = 0;
  start() {
    this.ws.start();
  }
  stop() {
    this.ws.stop();
  }
  onMessage(text) {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg.error) {
      this.o.log.warn("solana-rpc: error from RPC", { code: msg.error.code, message: msg.error.message });
      this.ws.h.note = `RPC error: ${msg.error.message ?? msg.error.code}`;
      return;
    }
    if (msg.id !== void 0 && msg.result !== void 0) {
      this.o.log.info(`solana-rpc: subscription ${msg.id} active`);
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
function exitReturn(s, c, h) {
  const ret = s.grid[c];
  const hold = HOLDS_MIN[h];
  if (hold === 0 || (s.gridT?.[c] ?? 0) <= hold * 60) return ret;
  const v = s.path?.[PATH_MIN.indexOf(hold)];
  return v ?? ret;
}
function describe(r) {
  const cond = CONDITIONS.find((c) => c.key === r.cond);
  const when = r.cond === "any" ? "" : ` \xB7 ${cond.label}`;
  const time = r.hold ? `, or after ${r.hold} min` : "";
  return `Buy when a coin first reaches ${r.level}${when} \xB7 sell at +${r.tp}% or \u2212${r.sl}%${time}`;
}
function settingsFor(r) {
  const cond = CONDITIONS.find((c) => c.key === r.cond);
  const out = {
    minScore: r.level,
    tpPct: r.tp,
    slPct: r.sl,
    maxHoldMin: r.hold || 360,
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
function stats(d, idx, e, z) {
  let n2 = 0;
  let sum = 0;
  let sq = 0;
  let w = 0;
  for (let k = 0; k < idx.length; k++) {
    const v = d.R[d.row(idx[k]) * EXITS + e] - d.shift[e];
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
  const z = normInv(1 - 0.05 / Math.max(1, cands.length));
  const checked = cands.map((c) => ({ c, hold: stats(d, c.g.hold, c.e, z) }));
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
  let lastResolved = 0;
  for (const s of samples) if (s.resolvedAt > lastResolved) lastResolved = s.resolvedAt;
  const cutoff = lastResolved - o.horizonMs;
  const rows = samples.filter(
    (s) => s.kind === "entry" && s.gv === GRID_VERSION && s.f && s.gridT?.length === GRID.length && s.path?.length === PATH_MIN.length && s.ts <= cutoff
  );
  rows.sort((a, b) => a.ts - b.ts);
  const n2 = rows.length;
  const t0 = n2 ? rows[0].ts : 0;
  const t1 = n2 ? rows[n2 - 1].ts : 0;
  const hours = n2 ? (t1 - t0) / 36e5 : 0;
  base.samples = n2;
  base.hours = hours;
  if (n2 < o.minSamples || hours < o.minHours) {
    base.note = `Needs at least ${o.minHours} hours of recorded market and ${o.minSamples.toLocaleString("en-US")} finished entry outcomes (so far: ${hours.toFixed(1)} h, ${n2.toLocaleString("en-US")}). Each outcome finishes ${Math.round(o.horizonMs / 36e5)} hours after its entry.`;
    return base;
  }
  const R = new Float32Array(n2 * EXITS);
  for (let i = 0; i < n2; i++) {
    const s = rows[i];
    for (let c = 0; c < GRID.length; c++) for (let h = 0; h < HOLDS_MIN.length; h++) R[i * EXITS + c * HOLDS_MIN.length + h] = exitReturn(s, c, h);
    if (i % 2e3 === 0) yield;
  }
  const split = t0 + (t1 - t0) * 2 / 3;
  const groups = [];
  const byLevel = /* @__PURE__ */ new Map();
  rows.forEach((s, i) => {
    const level = Number(s.tag.slice(1));
    let list = byLevel.get(level);
    if (!list) byLevel.set(level, list = []);
    list.push(i);
  });
  for (const level of ENTRY_LEVELS) {
    const idx = byLevel.get(level) ?? [];
    CONDITIONS.forEach((cond, ci) => {
      const disc = [];
      const hold = [];
      for (const i of idx) if (cond.test(rows[i])) (rows[i].ts < split ? disc : hold).push(i);
      groups.push({ level, cond: ci, disc: Int32Array.from(disc), hold: Int32Array.from(hold) });
    });
  }
  const zero = new Float64Array(EXITS);
  const real = { R, row: (i) => i, shift: zero, wins: (v) => v > 0 };
  const run = yield* search(real, groups, o);
  const holdDays = Math.max(1 / 24, (t1 - split) / 864e5);
  const toFound = (c, holdSt) => {
    const combo = Math.floor(c.e / HOLDS_MIN.length);
    const rule = { level: c.g.level, cond: CONDITIONS[c.g.cond].key, tp: GRID[combo].tp, sl: GRID[combo].sl, hold: HOLDS_MIN[c.e % HOLDS_MIN.length] };
    const all = groups.find((g) => g.level === c.g.level && g.cond === 0);
    return {
      ...rule,
      text: describe(rule),
      discovery: c.disc,
      holdout: holdSt,
      baseline: stats(real, all.hold, c.e, 0).mean,
      tradesPerDay: new Set(Array.from(c.g.hold, (i) => rows[i].mint)).size / holdDays,
      settings: settingsFor(rule)
    };
  };
  const survivors = run.passed.map((x) => toFound(x.c, x.hold)).sort((a, b) => b.holdout.lo - a.holdout.lo);
  const failed = run.cands.filter((x) => !run.passed.includes(x)).slice(0, 3).map((x) => toFound(x.c, x.hold));
  const colMean = new Float64Array(EXITS);
  for (let i = 0; i < n2; i++) for (let e = 0; e < EXITS; e++) colMean[e] += R[i * EXITS + e];
  for (let e = 0; e < EXITS; e++) colMean[e] /= n2;
  const rand = rng(o.seed);
  const counts = [];
  for (let r = 0; r < o.placeboRuns; r++) {
    const perm = new Int32Array(n2);
    for (let i = 0; i < n2; i++) perm[i] = i;
    for (let i = n2 - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = perm[i];
      perm[i] = perm[j];
      perm[j] = t;
    }
    counts.push((yield* search({ R, row: (i) => perm[i], shift: colMean, wins: (v) => v > 0 }, groups, o)).passed.length);
  }
  const discHours = (split - t0) / 36e5;
  return {
    ...base,
    status: "ok",
    note: survivors.length ? `${survivors.length} rule${survivors.length > 1 ? "s" : ""} held up on the newest data the search never saw.` : "No rule held up on the newest data yet. That is a real answer: keep recording, the search runs again every few hours.",
    discoveryHours: discHours,
    holdoutHours: hours - discHours,
    tested: run.tested,
    candidates: run.cands.length,
    survivors,
    failed,
    placebo: {
      runs: counts.length,
      avgSurvivors: counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0,
      maxSurvivors: counts.length ? Math.max(...counts) : 0
    }
  };
}

// src/core/learn.ts
function auc(scores, labels) {
  const idx = scores.map((s, i2) => i2).sort((a, b) => scores[a] - scores[b]);
  let rankSum = 0;
  let nPos = 0;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (labels[idx[k]] === 1) {
      rankSum += avgRank;
      nPos++;
    }
    i = j + 1;
  }
  const nNeg = labels.length - nPos;
  if (nPos === 0 || nNeg === 0) return NaN;
  return (rankSum - nPos * (nPos + 1) / 2) / (nPos * nNeg);
}
function evaluate(stage, rows) {
  const ps = [];
  const ys = [];
  let ll = 0;
  let br = 0;
  let pos = 0;
  for (const r of rows) {
    const lin = linear(stage, standardize(stage, r.x));
    const p = clamp(sigmoid(stage.calib ? stage.calib.a + stage.calib.b * lin : lin), 1e-6, 1 - 1e-6);
    ps.push(p);
    ys.push(r.y);
    ll += -(r.y * Math.log(p) + (1 - r.y) * Math.log(1 - p));
    br += (p - r.y) ** 2;
    pos += r.y;
  }
  const n2 = rows.length;
  return { n: n2, positives: pos, auc: auc(ps, ys), logLoss: n2 ? ll / n2 : NaN, brier: n2 ? br / n2 : NaN, baseRate: n2 ? pos / n2 : NaN };
}
function choleskySolve(A, b) {
  const n2 = b.length;
  const L = Array.from({ length: n2 }, () => new Array(n2).fill(0));
  for (let i = 0; i < n2; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 1e-12) return null;
        L[i][i] = Math.sqrt(s);
      } else L[i][j] = s / L[j][j];
    }
  }
  const y = new Array(n2).fill(0);
  for (let i = 0; i < n2; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  const x = new Array(n2).fill(0);
  for (let i = n2 - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n2; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}
function fitLogistic(Z, y, w, prior, lambda, maxIter = 30) {
  const d = prior.length;
  let beta = prior.slice();
  const objective = (b) => {
    let f2 = 0;
    for (let i = 0; i < Z.length; i++) {
      let s = b[0];
      const z = Z[i];
      for (let j = 1; j < d; j++) s += b[j] * z[j - 1];
      const p = clamp(sigmoid(s), 1e-9, 1 - 1e-9);
      f2 -= w[i] * (y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p));
    }
    for (let j = 1; j < d; j++) f2 += 0.5 * lambda * (b[j] - prior[j]) ** 2;
    f2 += 0.5 * 1e-4 * (b[0] - prior[0]) ** 2;
    return f2;
  };
  let fPrev = objective(beta);
  let converged = false;
  for (let iter = 0; iter < maxIter; iter++) {
    const g = new Array(d).fill(0);
    const H = Array.from({ length: d }, () => new Array(d).fill(0));
    for (let i = 0; i < Z.length; i++) {
      const z = Z[i];
      let s = beta[0];
      for (let j = 1; j < d; j++) s += beta[j] * z[j - 1];
      const p = sigmoid(s);
      const r = w[i] * (p - y[i]);
      const v = w[i] * Math.max(p * (1 - p), 1e-9);
      g[0] += r;
      H[0][0] += v;
      for (let j = 1; j < d; j++) {
        const zj = z[j - 1];
        g[j] += r * zj;
        H[0][j] += v * zj;
        for (let k = 1; k <= j; k++) H[j][k] += v * zj * z[k - 1];
      }
    }
    for (let j = 1; j < d; j++) {
      g[j] += lambda * (beta[j] - prior[j]);
      H[j][j] += lambda;
      H[j][0] = H[0][j];
      for (let k = 1; k < j; k++) H[k][j] = H[j][k];
    }
    g[0] += 1e-4 * (beta[0] - prior[0]);
    H[0][0] += 1e-4;
    const step = choleskySolve(H, g);
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
    const moved = Math.max(...step.map((s) => Math.abs(s * t)));
    beta = next;
    const improvement = fPrev - fNext;
    fPrev = fNext;
    if (moved < 1e-7 || improvement < 1e-9) {
      converged = true;
      break;
    }
  }
  return { beta, converged };
}
function weightedMeanStd(rows, j) {
  let sw = 0;
  let m = 0;
  for (const r of rows) {
    const w = r.w ?? 1;
    sw += w;
    m += w * r.x[j];
  }
  m /= sw || 1;
  let v = 0;
  for (const r of rows) v += (r.w ?? 1) * (r.x[j] - m) ** 2;
  v /= sw || 1;
  return { mean: m, std: Math.sqrt(v) };
}
function fitStage(base, rows, opts = {}) {
  const lambda = opts.lambda ?? 8;
  const half = opts.standardizeHalfRows ?? 400;
  const n2 = rows.length;
  const blend = n2 / (n2 + half);
  const mean2 = {};
  const std = {};
  FEATURE_KEYS.forEach((k, j) => {
    const s = weightedMeanStd(rows, j);
    const pm = base.mean[k] ?? 0;
    const ps = base.std[k] ?? 1;
    mean2[k] = (1 - blend) * pm + blend * s.mean;
    const sd = (1 - blend) * ps + blend * s.std;
    std[k] = sd > 1e-6 ? sd : ps;
  });
  const stage = { ...base, mean: mean2, std, calib: void 0 };
  const prior = [base.bias];
  FEATURE_KEYS.forEach((k) => {
    const w = base.weights[k] ?? 0;
    prior.push(w * ((std[k] ?? 1) / (base.std[k] ?? 1)));
  });
  let pos = 0;
  let sw = 0;
  for (const r of rows) {
    pos += (r.w ?? 1) * r.y;
    sw += r.w ?? 1;
  }
  const baseRate = clamp(sw > 0 ? pos / sw : base.pRef, 5e-3, 0.95);
  prior[0] = logit(baseRate);
  const Z = rows.map((r) => standardize(stage, r.x));
  const { beta } = fitLogistic(
    Z,
    rows.map((r) => r.y),
    rows.map((r) => r.w ?? 1),
    prior,
    lambda
  );
  const weights = {};
  FEATURE_KEYS.forEach((k, j) => {
    weights[k] = clamp(beta[j + 1], -10, 10);
  });
  return { pRef: baseRate, bias: beta[0], weights, mean: mean2, std };
}
function calibrate(stage, rows) {
  if (rows.length < 50) return stage;
  const lin = rows.map((r) => [linear(stage, standardize(stage, r.x))]);
  const { beta } = fitLogistic(
    lin,
    rows.map((r) => r.y),
    rows.map((r) => r.w ?? 1),
    [0, 1],
    0.5
  );
  if (!(beta[1] > 0.05)) return stage;
  return { ...stage, calib: { a: beta[0], b: beta[1] } };
}
function trainAndSelect(current, rows, opts = {}) {
  const minRows = opts.minRows ?? 300;
  const minPos = opts.minPositives ?? 25;
  const reports = [];
  let next = JSON.parse(JSON.stringify(current));
  let adoptedAny = false;
  for (const stageKey of ["curve", "amm"]) {
    const sr = rows.filter((r) => r.stage === stageKey).sort((a, b) => a.ts - b.ts);
    const cut = Math.floor(sr.length * 0.75);
    const train = sr.slice(0, cut);
    const val = sr.slice(cut);
    const cur = current.stages[stageKey];
    const empty = { n: 0, positives: 0, auc: NaN, logLoss: NaN, brier: NaN, baseRate: NaN };
    const pos = sr.reduce((s, r) => s + r.y, 0);
    if (sr.length < minRows || pos < minPos || val.length < 50) {
      reports.push({ adopted: false, reason: `need \u2265${minRows} resolved samples with \u2265${minPos} wins (have ${sr.length}/${pos})`, stage: stageKey, trainRows: train.length, valRows: val.length, current: val.length ? evaluate(cur, val) : empty, candidate: empty });
      continue;
    }
    let cand = fitStage(cur, train, opts);
    if (opts.calibrate !== false) {
      const calCut = Math.floor(train.length * 0.8);
      const fitPart = fitStage(cur, train.slice(0, calCut), opts);
      const cal = calibrate(fitPart, train.slice(calCut));
      if (cal.calib) cand = { ...cand, calib: cal.calib };
    }
    const mCur = evaluate(cur, val);
    const mCand = evaluate(cand, val);
    const better = Number.isFinite(mCand.logLoss) && (!Number.isFinite(mCur.logLoss) || mCand.logLoss < mCur.logLoss - 1e-3) && (!Number.isFinite(mCur.auc) || !Number.isFinite(mCand.auc) || mCand.auc >= mCur.auc - 5e-3);
    if (better) {
      const full = fitStage(cur, sr, opts);
      next.stages[stageKey] = cand.calib ? { ...full, calib: cand.calib } : full;
      adoptedAny = true;
    }
    reports.push({
      adopted: better,
      reason: better ? "challenger beat the current model on unseen (newer) data" : "current model still better on unseen data",
      stage: stageKey,
      trainRows: train.length,
      valRows: val.length,
      current: mCur,
      candidate: mCand
    });
  }
  if (adoptedAny) {
    const now = opts.now ?? Date.now();
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
        valAuc: reports.find((r) => r.adopted)?.candidate.auc,
        valLogLoss: reports.find((r) => r.adopted)?.candidate.logLoss,
        priorValAuc: reports.find((r) => r.adopted)?.current.auc,
        priorValLogLoss: reports.find((r) => r.adopted)?.current.logLoss
      }
    };
  }
  return { model: next, reports };
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
function sampleReturn(s, tp, sl) {
  if (s.tp === tp && s.sl === sl) return { ret: s.ret, exact: true };
  const g = gridOf(s);
  const gi = GRID.findIndex((c) => c.tp === tp && c.sl === sl);
  if (g && gi >= 0 && Number.isFinite(g[gi])) return { ret: g[gi], exact: true };
  return { ret: g?.[nearestGrid(tp, sl)] ?? s.ret, exact: false };
}
function statsOf(rets) {
  const wins2 = rets.filter((r) => r > 0).length;
  const w = wilson(wins2, rets.length);
  const m = meanCI(rets);
  return { n: rets.length, winRate: rets.length ? wins2 / rets.length : NaN, winLo: w.lo, winHi: w.hi, avgRet: m.mean, retLo: m.lo, retHi: m.hi };
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
  const retOf = (s) => sampleReturn(s, tp, sl).ret;
  const t0 = samples.reduce((m, s) => Math.min(m, s.ts), Infinity);
  const t1 = samples.reduce((m, s) => Math.max(m, s.ts), 0);
  const spanHours = samples.length ? Math.max(1 / 60, (t1 - t0) / 36e5) : 0;
  const buckets = [];
  for (let lo = 0; lo < 100; lo += 10) {
    const hi = lo + 10;
    const rows = checkpoints.filter((s) => s.score >= lo && (s.score < hi || hi === 100 && s.score <= 100));
    const st = statsOf(rows.map(retOf));
    const mm = rows.map((s) => s.maxMult).sort((a, b) => a - b);
    buckets.push({ lo, hi, n: st.n, winRate: st.winRate, winLo: st.winLo, winHi: st.winHi, avgRet: st.avgRet, retLo: st.retLo, retHi: st.retHi, medMaxMult: quantile(mm, 0.5) });
  }
  const sigAbove = signals.filter((s) => s.score >= settings.minScore);
  const signalStats = statsOf(sigAbove.map(retOf));
  const entries = samples.filter((s) => s.kind === "entry");
  const thresholdSource = entries.length >= 200 ? "entries" : "checkpoints";
  const atLevel = (min) => thresholdSource === "entries" ? entries.filter((s) => s.tag === `x${min}`) : checkpoints.filter((s) => s.score >= min);
  const thresholds = [];
  for (let min = 50; min <= 95; min += 5) {
    const rows = atLevel(min);
    const st = statsOf(rows.map(retOf));
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
    const rets = pool.map((s) => gridOf(s)?.[i]).filter((x) => Number.isFinite(x));
    const st = statsOf(rets);
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
      detail: `Average ${(signalStats.avgRet * 100).toFixed(1)}% per trade (95% range ${(signalStats.retLo * 100).toFixed(1)}% to ${(signalStats.retHi * 100).toFixed(1)}%) after fees, delay and slippage. The low end must clear +2% before risking real money.`
    };
  } else {
    gate = {
      pass: true,
      verdict: "Evidence supports these settings",
      detail: `Average ${(signalStats.avgRet * 100).toFixed(1)}% per trade over ${signalStats.n} signals; 95% range ${(signalStats.retLo * 100).toFixed(1)}% to ${(signalStats.retHi * 100).toFixed(1)}%. Past results in this market can still stop working \u2014 start small.`
    };
  }
  let suggestion = null;
  const zBound = (xs, z) => {
    const m = meanCI(xs);
    return Number.isFinite(m.lo) ? m.mean - (m.mean - m.lo) / 1.96 * z : -Infinity;
  };
  const cur = pool.map(retOf);
  let bestLo = cur.length >= 30 ? zBound(cur, 3.5) : -Infinity;
  const mid = t0 + (t1 - t0) / 2;
  for (let min = 50; min <= 95; min += 5) {
    const rows = atLevel(min);
    if (rows.length < 150) continue;
    GRID.forEach((g, i) => {
      const val = (s) => gridOf(s)?.[i];
      const all = rows.map(val).filter((x) => Number.isFinite(x));
      if (all.length < 150) return;
      const lo = zBound(all, 3.5);
      if (!(lo > 0) || lo <= bestLo + 5e-3) return;
      const older = rows.filter((s) => s.ts < mid).map(val).filter((x) => Number.isFinite(x));
      const newer = rows.filter((s) => s.ts >= mid).map(val).filter((x) => Number.isFinite(x));
      if (older.length < 50 || newer.length < 50 || !(zBound(older, 1.96) > 0) || !(zBound(newer, 1.96) > 0)) return;
      const m = meanCI(all);
      bestLo = lo;
      suggestion = {
        minScore: min,
        tpPct: g.tp,
        slPct: g.sl,
        avgRet: m.mean,
        retLo: lo,
        n: all.length,
        why: `${thresholdSource === "entries" ? "buying when coins first reached" : "coins scoring"} ${min}+ with TP ${g.tp}% / SL ${g.sl}% averaged ${(m.mean * 100).toFixed(1)}% per trade over ${all.length} outcomes, positive in both the older and newer half of the data (strict worst case ${(lo * 100).toFixed(1)}%)`
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

// src/node/learner.ts
var Learner = class {
  constructor(o) {
    this.o = o;
  }
  lastRun = 0;
  lastReports = [];
  lastError = "";
  running = false;
  lastEdges = null;
  edgesRunning = false;
  timer = null;
  start() {
    this.lastEdges = this.o.store.loadEdges() ?? null;
    if (this.o.everyHours <= 0) return;
    this.timer = setInterval(() => void this.run(), this.o.everyHours * 36e5);
    this.timer.unref?.();
    setTimeout(() => void this.run(), 20 * 6e4).unref?.();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }
  /** Searches the recorded outcomes for rules that made money on their own (see core/edges). */
  async findEdges(samples) {
    if (this.edgesRunning) return this.lastEdges;
    this.edgesRunning = true;
    try {
      const rep = await findEdgesAsync(samples ?? this.o.store.loadSamples(this.o.sampleDays), { placeboRuns: 5 });
      const before = new Set(this.lastEdges?.survivors.map((x) => x.text) ?? []);
      const fresh = rep.survivors.filter((x) => !before.has(x.text));
      this.lastEdges = rep;
      if (fresh.length) {
        const lines = fresh.slice(0, 3).map((x) => `\u2022 ${x.text}: ${(x.holdout.mean * 100).toFixed(1)}% per trade on unseen data (${x.holdout.n} trades)`);
        this.o.onEdges?.(`\u{1F50E} Edge finder: ${fresh.length} new rule${fresh.length > 1 ? "s" : ""} held up on data the search never saw.
${lines.join("\n")}
Paper-trade it from the Learn tab.`);
      }
      this.o.store.saveEdges(rep);
      if (rep.survivors.length) this.o.log.info("edge search", { survivors: rep.survivors.map((x) => x.text), placebo: rep.placebo.avgSurvivors });
      return rep;
    } catch (e) {
      this.o.log.error("edge search failed", { err: String(e) });
      return this.lastEdges;
    } finally {
      this.edgesRunning = false;
    }
  }
  /** Paper mode + autoTune: adopt a robustly better TP/SL/score combination. */
  autoTune(samples) {
    const engine = this.o.engine();
    const s = engine.settings;
    if (!s.autoTune || s.mode !== "paper") return;
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
  async run() {
    if (this.running) return this.lastReports;
    this.running = true;
    try {
      const engine = this.o.engine();
      const samples = this.o.store.loadSamples(this.o.sampleDays);
      const rows = samples.filter((s) => s.kind === "checkpoint").map((s) => ({ ts: s.ts, stage: s.stage, x: s.x, y: s.y }));
      const { model, reports } = trainAndSelect(engine.model, rows, { now: Date.now() });
      this.lastReports = reports;
      this.lastRun = Date.now();
      this.lastError = "";
      if (reports.some((r) => r.adopted)) {
        engine.setModel(model);
        this.o.store.saveModel(model);
        this.o.log.info("new scoring model adopted", { version: model.version, reports: reports.map((r) => ({ stage: r.stage, auc: r.candidate.auc, was: r.current.auc })) });
        this.o.onAdopt?.(model.version);
      } else this.o.log.info("model kept", { reasons: reports.map((r) => `${r.stage}: ${r.reason}`) });
      this.autoTune(samples);
      void this.findEdges(samples);
      return reports;
    } catch (e) {
      this.lastError = String(e);
      this.o.log.error("learning run failed", { err: String(e) });
      return [];
    } finally {
      this.running = false;
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
  const sig = wallet.sign(message);
  const out = new Uint8Array(tx);
  out.set(sig, parsed.sigOffset + idx * 64);
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
  async signatureStatus(sig) {
    const r = await this.call("getSignatureStatuses", [[sig], { searchTransactionHistory: false }]);
    const v = r?.value?.[0];
    if (!v) return null;
    return { confirmed: v.confirmationStatus === "confirmed" || v.confirmationStatus === "finalized", err: v.err ?? null };
  }
  getTransaction(sig) {
    return this.call("getTransaction", [sig, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }], 15e3);
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
  const sig = ev.sig;
  if (!sig) return null;
  switch (ev.k) {
    case "create":
    case "complete":
    case "migrate":
      return `${ev.k}:${sig}:${ev.mint}`;
    case "trade":
      return `t:${sig}:${ev.mint}:${ev.user}:${ev.buy ? 1 : 0}:${Math.round(ev.tok / 1e3)}`;
    case "ammSwap":
      return `a:${sig}:${ev.pool}:${ev.user}:${ev.buy ? 1 : 0}:${Math.round(ev.base / 1e3)}`;
    case "pool":
      return `p:${sig}:${ev.pool}`;
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
import { readFileSync as readFileSync4, readdirSync as readdirSync2 } from "node:fs";
import { join as join3 } from "node:path";

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
        const stored = ctx.samples(days);
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
      case "/api/live/resume":
        ctx.live?.resume();
        return ok({ live: ctx.live?.status() ?? null });
      case "/api/paper/reset": {
        if (e.positions.size > 0) return err(400, "Close open positions first.");
        e.paperBalance = e.cfg.paperStartSol * 1e9;
        e.stats.realized = 0;
        e.stats.dayPnl = 0;
        e.stats.wins = 0;
        e.stats.losses = 0;
        e.stats.equity = [{ t: Date.now(), v: e.paperBalance }];
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

// src/node/setup.ts
import { exec } from "node:child_process";
import { chmodSync, existsSync as existsSync3, readFileSync as readFileSync3, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join as join2 } from "node:path";

// src/node/store.ts
import {
  closeSync,
  createWriteStream,
  existsSync as existsSync2,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync as readFileSync2,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeSync
} from "node:fs";
import { join } from "node:path";
import { createGzip, gunzipSync, gzipSync } from "node:zlib";
import { StringDecoder } from "node:string_decoder";
var day = (ts) => new Date(ts).toISOString().slice(0, 10);
var SAMPLE_LIMITS = { checkpoints: 4e4, entries: 25e3 };
function forEachLine(path, fn) {
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
  renameSync(tmp, path);
}
var DataStore = class {
  constructor(dir, log) {
    this.log = log;
    this.dir = dir;
    for (const sub of ["", "journal", "samples", "record", "models", "reports"]) mkdirSync(join(dir, sub), { recursive: true });
    this.flushTimer = setInterval(() => this.flush(), 1e3);
    this.flushTimer.unref?.();
  }
  dir;
  recStream = null;
  recorded = 0;
  journalLines = [];
  sampleLines = [];
  flushTimer = null;
  // ---- state -------------------------------------------------------------------
  saveState(s) {
    writeFileAtomic(join(this.dir, "state.json"), JSON.stringify(s));
  }
  loadState() {
    for (const name of ["state.json", "state.json.bak"]) {
      const p = join(this.dir, name);
      if (!existsSync2(p)) continue;
      try {
        const s = JSON.parse(readFileSync2(p, "utf8"));
        if (s && s.v === 1) return s;
      } catch (e) {
        this.log.error(`could not read ${name}`, { err: String(e) });
      }
    }
    return null;
  }
  /** Daily backup copy so a corrupted disk write can never lose everything. */
  backupState() {
    const p = join(this.dir, "state.json");
    if (existsSync2(p)) {
      try {
        writeFileAtomic(join(this.dir, "state.json.bak"), readFileSync2(p));
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
        appendLines(join(this.dir, "journal", `${day(now)}.jsonl`), lines);
      }
      if (this.sampleLines.length) {
        const lines = this.sampleLines.splice(0);
        appendLines(join(this.dir, "samples", `${day(now)}.jsonl`), lines);
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
  loadSamples(days, now = Date.now(), limits = SAMPLE_LIMITS) {
    const cutoff = day(now - days * 864e5);
    let files = [];
    try {
      files = readdirSync(join(this.dir, "samples")).filter((f2) => f2.endsWith(".jsonl") && f2.slice(0, 10) >= cutoff).sort().reverse();
    } catch {
      return [];
    }
    const perFile = [];
    let nCp = 0;
    let nEn = 0;
    for (const f2 of files) {
      const roomCp = limits.checkpoints - nCp;
      const roomEn = limits.entries - nEn;
      if (roomCp <= 0 && roomEn <= 0) break;
      const cps = [];
      const ens = [];
      try {
        forEachLine(join(this.dir, "samples", f2), (line) => {
          const isCp = line.includes('"kind":"checkpoint"');
          if (isCp ? roomCp <= 0 : roomEn <= 0) return;
          let s;
          try {
            s = JSON.parse(line);
          } catch {
            return;
          }
          if (!Array.isArray(s.x) || s.y !== 0 && s.y !== 1) return;
          const into = s.kind === "checkpoint" ? cps : ens;
          const room = s.kind === "checkpoint" ? roomCp : roomEn;
          into.push(s);
          if (into.length >= room * 2) into.splice(0, into.length - room);
        });
      } catch (e) {
        this.log.warn("could not read samples", { file: f2, err: String(e) });
        continue;
      }
      if (cps.length > roomCp) cps.splice(0, cps.length - Math.max(0, roomCp));
      if (ens.length > roomEn) ens.splice(0, ens.length - Math.max(0, roomEn));
      nCp += cps.length;
      nEn += ens.length;
      perFile.push(cps.concat(ens));
    }
    return perFile.reverse().flat().sort((a, b) => a.ts - b.ts);
  }
  // ---- market recorder (gzip, hourly files) ----------------------------------------
  record(ev, ts) {
    const key = hour(ts);
    if (!this.recStream || this.recStream.key !== key) {
      this.closeRecorder();
      const gz = createGzip({ level: 6 });
      const file = createWriteStream(join(this.dir, "record", `${key}.jsonl.gz`), { flags: "a" });
      file.on("error", (e) => this.log.error("recorder write failed", { err: String(e) }));
      gz.pipe(file);
      this.recStream = { key, gz, file };
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
      return readdirSync(join(this.dir, "record")).filter((f2) => f2.endsWith(".jsonl.gz")).sort().map((f2) => join(this.dir, "record", f2));
    } catch {
      return [];
    }
  }
  // ---- models ----------------------------------------------------------------------
  saveModel(m) {
    writeFileAtomic(join(this.dir, "models", "current.json"), JSON.stringify(m, null, 1));
    const safe = m.version.replace(/[^A-Za-z0-9_.-]/g, "_");
    writeFileAtomic(join(this.dir, "models", `${safe}.json`), JSON.stringify(m));
  }
  loadModel() {
    const p = join(this.dir, "models", "current.json");
    if (!existsSync2(p)) return null;
    try {
      const m = JSON.parse(readFileSync2(p, "utf8"));
      return validateModel(m) ? m : null;
    } catch {
      return null;
    }
  }
  // ---- edge finder -----------------------------------------------------------------
  saveEdges(report) {
    writeFileAtomic(join(this.dir, "edges.json"), JSON.stringify(report));
  }
  loadEdges() {
    const p = join(this.dir, "edges.json");
    if (!existsSync2(p)) return null;
    try {
      return JSON.parse(readFileSync2(p, "utf8"));
    } catch {
      return null;
    }
  }
  // ---- wallets ---------------------------------------------------------------------
  saveWallets(snap) {
    writeFileAtomic(join(this.dir, "wallets.json.gz"), gzipSync(JSON.stringify(snap)));
  }
  loadWallets() {
    const p = join(this.dir, "wallets.json.gz");
    if (!existsSync2(p)) return null;
    try {
      return JSON.parse(gunzipSync(readFileSync2(p)).toString("utf8"));
    } catch {
      return null;
    }
  }
  // ---- misc --------------------------------------------------------------------------
  readSecret() {
    const p = join(this.dir, "secret.json");
    if (!existsSync2(p)) return null;
    try {
      return JSON.parse(readFileSync2(p, "utf8")).token ?? null;
    } catch {
      return null;
    }
  }
  writeSecret(token) {
    writeFileAtomic(join(this.dir, "secret.json"), JSON.stringify({ token }));
  }
  /** Delete recordings/samples/journals past their retention. */
  cleanup(recordDays, sampleDays, now = Date.now()) {
    const prune = (sub, days) => {
      const cutoff = day(now - days * 864e5);
      try {
        for (const f2 of readdirSync(join(this.dir, sub))) if (f2.slice(0, 10) < cutoff) rmSync(join(this.dir, sub, f2), { force: true });
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
          const p = join(d, f2);
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
  "LIVE_MAX_DAILY_LOSS_SOL"
];
var LIVE_PHRASE = "I_UNDERSTAND_THE_RISK";
var SetupStore = class {
  path;
  constructor(dataDir) {
    this.path = join2(dataDir, "config.json");
  }
  read() {
    if (!existsSync3(this.path)) return {};
    try {
      const raw = JSON.parse(readFileSync3(this.path, "utf8"));
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
function lanAddress() {
  const all = Object.values(networkInterfaces()).flat();
  const v4 = all.filter((i) => !!i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  return v4.find((a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a)) ?? v4[0] ?? null;
}
function openBrowser(url, dataDir) {
  const stamp = join2(dataDir, ".browser-opened");
  try {
    if (existsSync3(stamp) && Date.now() - Number(readFileSync3(stamp, "utf8")) < 10 * 6e4) return;
    writeFileSync(stamp, String(Date.now()));
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
  /** The Learn tab refreshes every minute; reading days of samples from disk each time is wasteful. */
  cachedSamples(days) {
    const c = this.sampleCache;
    if (c && c.days === days && Date.now() - c.at < 5 * 6e4) return c.data;
    const data = this.ctx.store.loadSamples(days);
    this.sampleCache = { days, at: Date.now(), data };
    if (this.sampleCacheTimer) clearTimeout(this.sampleCacheTimer);
    this.sampleCacheTimer = setTimeout(() => this.sampleCache = null, 6 * 6e4);
    this.sampleCacheTimer.unref?.();
    return data;
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
    if (path === "/healthz") return this.json(res, 200, { ok: true, uptime: process.uptime() });
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
    const mbPerDay = feed?.bytes ? feed.bytes / 1e6 * (86400 / up) : null;
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
    const num3 = (k, d) => Number.isFinite(Number(eff(k))) && eff(k) !== "" ? Number(eff(k)) : d;
    return {
      supervised: process.env.SIGNAL_SUPERVISED === "1",
      local: isLocalRequest(req),
      privateChannel: isPrivateChannel(req),
      rpc: {
        host,
        isPublic: /api\.mainnet-beta\.solana\.com/.test(host),
        feed: feed ? { status: feed.status, msgs: feed.msgs, mbPerDay } : null
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
      phoneUrl: lan ? `http://${lan}:${this.ctx.port}/?token=${this.ctx.token}` : null
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
      const dir = join3(this.ctx.store.dir, sub);
      for (const f2 of readdirSync2(dir).filter((x) => x.endsWith(".jsonl")).sort()) res.write(readFileSync4(join3(dir, f2)));
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
    if (this.enabled) this.send("\u{1F7E2} <b>SIGNAL started</b>\nSend /help for commands.");
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
          this.send(this.command(text));
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
  /** Execute a chat command and return the reply (exported behaviour is tested). */
  command(text) {
    const e = this.o.engine();
    const [cmd, arg] = text.split(/\s+/, 2);
    const n2 = arg !== void 0 ? Number(arg) : NaN;
    switch (cmd.toLowerCase().replace(/@.*/, "")) {
      case "/start":
      case "/help":
        return [
          "<b>SIGNAL commands</b>",
          "/status \u2014 bot, P&amp;L, feeds",
          "/positions \u2014 open trades",
          "/pause \xB7 /resume \u2014 auto-trading off/on",
          "/score 75 \u2014 minimum score",
          "/tp 100 \xB7 /sl 50 \u2014 take profit / stop loss %",
          "/hold 10 \u2014 sell after N minutes (0 = no limit)",
          "/size 0.1 \u2014 SOL per trade",
          "/scoreonly on|off \u2014 trade on score alone",
          "/kill \u2014 stop entries and sell everything \xB7 /unkill"
        ].join("\n");
      case "/status": {
        const a = e.account();
        const h = e.health();
        const s = e.settings;
        const feeds = h.feeds.map((f2) => `${f2.status === "open" ? "\u{1F7E2}" : "\u{1F534}"} ${f2.name}`).join("  ");
        return [
          `<b>${s.enabled ? "\u25B6\uFE0F Trading" : "\u23F8 Paused"}</b> \xB7 ${s.mode.toUpperCase()}${e.killed ? " \xB7 KILL SWITCH" : ""}`,
          `Score \u2265 ${s.minScore}${s.scoreOnly ? " (score only)" : ""} \xB7 TP ${s.tpPct}% \xB7 SL ${s.slPct}% \xB7 ${s.maxHoldMin > 0 ? `sell after ${s.maxHoldMin} min` : "no time limit"} \xB7 ${s.positionSol} SOL`,
          `Today ${sol(a.dayPnl)} SOL \xB7 total ${sol(a.realized)} SOL \xB7 ${a.wins}W/${a.losses}L`,
          `Open ${a.open.length}/${s.maxOpen}`,
          feeds
        ].join("\n");
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
      case "/score":
        if (!Number.isFinite(n2)) return "Usage: /score 75";
        e.updateSettings({ minScore: n2 });
        return `Minimum score set to ${e.settings.minScore}.`;
      case "/tp":
        if (!Number.isFinite(n2)) return "Usage: /tp 100";
        e.updateSettings({ tpPct: n2 });
        return `Take profit ${e.settings.tpPct}% (new positions).`;
      case "/sl":
        if (!Number.isFinite(n2)) return "Usage: /sl 50";
        e.updateSettings({ slPct: n2 });
        return `Stop loss ${e.settings.slPct}% (new positions).`;
      case "/hold":
        if (!Number.isFinite(n2)) return "Usage: /hold 10 (minutes, 0 = no limit)";
        e.updateSettings({ maxHoldMin: n2 });
        return e.settings.maxHoldMin > 0 ? `New positions sell after ${e.settings.maxHoldMin} min if neither TP nor SL was hit.` : "No time limit for new positions.";
      case "/size":
        if (!Number.isFinite(n2)) return "Usage: /size 0.1";
        e.updateSettings({ positionSol: n2 });
        return `Position size ${e.settings.positionSol} SOL.`;
      case "/scoreonly": {
        const on = arg === "on" || arg === "1" || arg === "true";
        e.updateSettings({ scoreOnly: on });
        return on ? "Score only: ON \u2014 filters ignored, account limits still apply." : "Score only: OFF \u2014 filters active.";
      }
      case "/kill":
        e.setKill(true, true);
        return "\u{1F6D1} Kill switch ON: no new entries, selling open positions.";
      case "/unkill":
        e.setKill(false);
        return "Kill switch off.";
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

// src/node/main.ts
function dashboardHtml() {
  if ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="theme-color" content="#0f1318">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<meta name="apple-mobile-web-app-title" content="SIGNAL">\n<title>SIGNAL</title>\n<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' rx=\'7\' fill=\'%230f1318\'/%3E%3Cpath d=\'M6 22 L12 14 L17 18 L26 8\' stroke=\'%23f2a93b\' stroke-width=\'3.2\' fill=\'none\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E">\n<style>\n:root{\n  --ground:#f5f6f8; --surface:#ffffff; --raised:#eef1f5; --line:#dde2ea; --line2:#c9d0db;\n  --ink:#10151c; --ink2:#4a5566; --ink3:#7a8596;\n  --flare:#b86e00; --flare-soft:#fbead0; --flare-ink:#1a1204;\n  --good:#138a5a; --good-soft:#dff3ea; --bad:#cc3340; --bad-soft:#fbe3e5; --warn:#9a7400; --warn-soft:#f7efcf; --info:#2f6fc0;\n  --shadow:0 1px 2px rgba(16,21,28,.06),0 6px 20px rgba(16,21,28,.06);\n  --r:12px; --r-sm:8px;\n  --mono:ui-monospace,"SF Mono","Cascadia Mono","JetBrains Mono",Menlo,Consolas,monospace;\n  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI Variable","Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,sans-serif;\n  color-scheme:light;\n}\n@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){\n  --ground:#0f1318; --surface:#161b22; --raised:#1d2430; --line:#262e3b; --line2:#334052;\n  --ink:#e7ebf2; --ink2:#a3adbd; --ink3:#6f7a8c;\n  --flare:#f2a93b; --flare-soft:#3a2a12; --flare-ink:#1a1204;\n  --good:#3ecf8e; --good-soft:#12301f; --bad:#ff6b6b; --bad-soft:#3a1519; --warn:#e8c547; --warn-soft:#332b0f; --info:#6aa8ff;\n  --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.25);\n  color-scheme:dark;\n}}\n:root[data-theme="dark"]{\n  --ground:#0f1318; --surface:#161b22; --raised:#1d2430; --line:#262e3b; --line2:#334052;\n  --ink:#e7ebf2; --ink2:#a3adbd; --ink3:#6f7a8c;\n  --flare:#f2a93b; --flare-soft:#3a2a12; --flare-ink:#1a1204;\n  --good:#3ecf8e; --good-soft:#12301f; --bad:#ff6b6b; --bad-soft:#3a1519; --warn:#e8c547; --warn-soft:#332b0f; --info:#6aa8ff;\n  --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.25);\n  color-scheme:dark;\n}\n*{box-sizing:border-box}\nhtml,body{margin:0;height:100%}\nbody{background:var(--ground);color:var(--ink);font:14px/1.45 var(--sans);-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}\nbutton,input,select{font:inherit;color:inherit}\na{color:var(--info);text-decoration:none}\n[hidden]{display:none!important}\n.num{font-variant-numeric:tabular-nums}\n.mono{font-family:var(--mono);font-size:12.5px}\n.muted{color:var(--ink2)} .faint{color:var(--ink3)}\n.good{color:var(--good)} .bad{color:var(--bad)} .warn{color:var(--warn)} .flare{color:var(--flare)}\n\n/* shell */\n.app{min-height:100%;display:flex;flex-direction:column}\n.top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--ground) 88%,transparent);backdrop-filter:saturate(1.4) blur(12px);-webkit-backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--line);padding:calc(env(safe-area-inset-top,0px) + 10px) 16px 10px}\n.top-row{display:flex;align-items:center;gap:10px;max-width:1180px;margin:0 auto}\n.brand{display:flex;align-items:center;gap:8px;font-weight:750;letter-spacing:.14em;font-size:13px}\n.brand svg{flex:none}\n.pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:650;border:1px solid var(--line);background:var(--surface);white-space:nowrap}\n.dot{width:8px;height:8px;border-radius:50%;background:var(--ink3);flex:none}\n.dot.on{background:var(--good);box-shadow:0 0 0 3px color-mix(in srgb,var(--good) 22%,transparent)}\n.dot.off{background:var(--bad)} .dot.mid{background:var(--warn)}\n.spacer{flex:1}\n.top-pnl{font-weight:700;font-size:15px;white-space:nowrap}\n.main{flex:1;width:100%;max-width:1180px;margin:0 auto;padding:14px 16px calc(84px + env(safe-area-inset-bottom,0px))}\n.tabs{position:fixed;left:0;right:0;bottom:0;z-index:30;display:flex;justify-content:space-around;background:color-mix(in srgb,var(--surface) 94%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);padding:6px 6px calc(6px + env(safe-area-inset-bottom,0px))}\n.tab{flex:1;max-width:120px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px;border:0;background:none;border-radius:10px;color:var(--ink3);font-size:11px;font-weight:600;cursor:pointer}\n.tab svg{width:22px;height:22px}\n.tab[aria-current="page"]{color:var(--flare)}\n.tab:focus-visible,.btn:focus-visible,.chip:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--flare);outline-offset:2px}\n@media (min-width:900px){\n  .tabs{position:sticky;top:57px;bottom:auto;justify-content:flex-start;gap:4px;padding:6px 16px;border-top:0;border-bottom:1px solid var(--line);background:var(--ground)}\n  .tab{flex:none;flex-direction:row;gap:8px;font-size:13px;padding:8px 14px;max-width:none}\n  .tab svg{width:18px;height:18px}\n  .tab[aria-current="page"]{background:var(--flare-soft)}\n  .main{padding-bottom:40px}\n}\n.banner{max-width:1180px;width:calc(100% - 32px);margin:10px auto 0;padding:10px 14px;border-radius:var(--r-sm);font-weight:600;font-size:13px;display:flex;gap:10px;align-items:center}\n.banner.sim{background:var(--warn-soft);color:var(--warn);border:1px solid color-mix(in srgb,var(--warn) 30%,transparent)}\n.banner.bad{background:var(--bad-soft);color:var(--bad);border:1px solid color-mix(in srgb,var(--bad) 30%,transparent)}\n\n/* building blocks */\n.grid{display:grid;gap:12px}\n.grid > *{min-width:0}\n.main{overflow-x:clip}\n@media (min-width:760px){.grid.two{grid-template-columns:1fr 1fr}.grid.three{grid-template-columns:repeat(3,1fr)}}\n.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:14px;box-shadow:var(--shadow)}\n.card.flat{box-shadow:none}\n.card h2,.card h3{margin:0 0 10px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2);font-weight:700}\n.section-title{display:flex;align-items:baseline;gap:10px;margin:18px 2px 10px}\n.section-title h2{margin:0;font-size:17px;font-weight:720;text-wrap:balance}\n.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}\n@media (min-width:640px){.stats{grid-template-columns:repeat(4,1fr)}}\n.stat .k{font-size:11.5px;color:var(--ink3);text-transform:uppercase;letter-spacing:.06em;font-weight:650}\n.stat .v{font-size:20px;font-weight:720;margin-top:2px}\n.stat .s{font-size:12px;color:var(--ink2)}\n.row{display:flex;align-items:center;gap:10px}\n.wrap{flex-wrap:wrap}\n.chips{display:flex;gap:6px;flex-wrap:wrap}\n.chip{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:5px 11px;font-size:12.5px;font-weight:600;cursor:pointer;color:var(--ink2)}\n.chip[aria-pressed="true"]{background:var(--ink);color:var(--ground);border-color:var(--ink)}\n.tag{display:inline-block;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:650;background:var(--raised);color:var(--ink2);white-space:nowrap}\n.tag.good{background:var(--good-soft);color:var(--good)} .tag.bad{background:var(--bad-soft);color:var(--bad)} .tag.warn{background:var(--warn-soft);color:var(--warn)} .tag.flare{background:var(--flare-soft);color:var(--flare)}\n.btn{border:1px solid var(--line2);background:var(--surface);border-radius:10px;padding:9px 14px;font-weight:650;cursor:pointer;min-height:40px}\n.btn.primary{background:var(--flare);border-color:var(--flare);color:var(--flare-ink)}\n.btn.danger{background:var(--bad);border-color:var(--bad);color:#fff}\n.btn.ghost{background:none;border-color:transparent}\n.btn.sm{min-height:32px;padding:5px 10px;font-size:12.5px}\n.btn:disabled{opacity:.5;cursor:not-allowed}\n\n/* score badge */\n.score{flex:none;width:46px;height:46px;border-radius:12px;display:grid;place-items:center;font-weight:800;font-size:17px;background:var(--raised);color:var(--ink2);position:relative}\n.score small{position:absolute;bottom:3px;font-size:8.5px;font-weight:700;letter-spacing:.06em;opacity:.8}\n.score.b1{background:var(--raised);color:var(--ink3)}\n.score.b2{background:color-mix(in srgb,var(--flare) 16%,var(--surface));color:var(--ink)}\n.score.b3{background:var(--flare);color:var(--flare-ink)}\n\n/* radar list */\n.list{display:flex;flex-direction:column;gap:8px}\n.coin{display:flex;gap:12px;align-items:flex-start;padding:12px;border-radius:var(--r);background:var(--surface);border:1px solid var(--line);cursor:pointer;text-align:left;width:100%}\n.coin:hover{border-color:var(--line2)}\n.coin.held{border-color:var(--flare);box-shadow:inset 3px 0 0 var(--flare)}\n.coin .body{flex:1;min-width:0}\n.coin .title{display:flex;align-items:baseline;gap:6px;min-width:0}\n.coin .sym{font-weight:760;font-size:15px}\n.coin .name{color:var(--ink3);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.coin .meta{display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;font-size:12.5px;color:var(--ink2)}\n.coin .why{margin-top:6px;font-size:12px;color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.coin .right{text-align:right;flex:none}\n.bar{height:5px;border-radius:3px;background:var(--raised);overflow:hidden;margin-top:6px}\n.bar > i{display:block;height:100%;background:var(--flare);border-radius:3px}\n.img{width:34px;height:34px;border-radius:9px;object-fit:cover;background:var(--raised);flex:none}\n\n/* forms */\n.field{display:flex;flex-direction:column;gap:6px;padding:12px 0;border-bottom:1px solid var(--line)}\n.field:last-child{border-bottom:0}\n.field label{font-weight:650}\n.field .help{font-size:12.5px;color:var(--ink3)}\n.field .ctrl{display:flex;align-items:center;gap:10px}\n.inp{width:100%;max-width:140px;padding:9px 11px;border-radius:10px;border:1px solid var(--line2);background:var(--ground);font-variant-numeric:tabular-nums}\ninput[type=range]{flex:1;accent-color:var(--flare);height:32px}\n.switch{position:relative;width:48px;height:28px;flex:none}\n.switch input{opacity:0;width:0;height:0;position:absolute}\n.switch span{position:absolute;inset:0;border-radius:999px;background:var(--line2);transition:.15s}\n.switch span::after{content:"";position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:.15s}\n.switch input:checked + span{background:var(--flare)}\n.switch input:checked + span::after{transform:translateX(20px)}\n.switch input:focus-visible + span{outline:2px solid var(--flare);outline-offset:2px}\n.bigswitch{display:flex;align-items:center;gap:14px;padding:14px;border-radius:var(--r);border:1px solid var(--line);background:var(--surface)}\n.bigswitch.on{border-color:var(--good);background:color-mix(in srgb,var(--good) 7%,var(--surface))}\ndetails.more{border-top:1px solid var(--line);margin-top:6px}\ndetails.more summary{cursor:pointer;padding:12px 0;font-weight:650;color:var(--ink2)}\n\n/* tables */\n.tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch}\ntable{width:100%;border-collapse:collapse;font-size:13px}\nth{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3);font-weight:700;padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap}\ntd{padding:7px 8px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums;white-space:nowrap}\ntd.r,th.r{text-align:right}\ntr:last-child td{border-bottom:0}\n\n/* contribution bars */\n.contrib{display:grid;grid-template-columns:1fr 90px;gap:4px 10px;align-items:center;font-size:12.5px}\n.cbar{position:relative;height:8px;background:var(--raised);border-radius:4px}\n.cbar i{position:absolute;top:0;bottom:0;border-radius:4px}\n.cbar .mid{position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--line2)}\n\n/* sheet */\n.sheet-bg{position:fixed;inset:0;z-index:50;background:rgba(8,10,14,.5);display:flex;align-items:flex-end;justify-content:center}\n.sheet{width:100%;max-width:760px;max-height:92vh;overflow:auto;background:var(--ground);border-radius:18px 18px 0 0;padding:16px 16px calc(24px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px rgba(0,0,0,.35)}\n@media (min-width:760px){.sheet-bg{align-items:center}.sheet{border-radius:18px;max-height:86vh}}\n.grab{width:40px;height:5px;border-radius:3px;background:var(--line2);margin:0 auto 12px}\n.entrymoment{padding:10px 12px;border-radius:var(--r-sm);background:var(--raised);color:var(--ink2);font-size:13px}\n.entrymoment.good{background:var(--good-soft);color:var(--good)}\n.entrymoment.warn{background:var(--warn-soft);color:var(--warn)}\n\n.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(90px + env(safe-area-inset-bottom,0px));z-index:60;background:var(--ink);color:var(--ground);padding:10px 16px;border-radius:12px;font-weight:650;box-shadow:var(--shadow);max-width:calc(100% - 32px)}\n.empty{padding:28px 16px;text-align:center;color:var(--ink3)}\n.login{max-width:420px;margin:12vh auto;padding:0 16px}\n.hist{display:flex;align-items:flex-end;gap:3px;height:56px}\n.hist i{flex:1;background:var(--line2);border-radius:3px 3px 0 0;min-height:2px}\n.hist i.hot{background:var(--flare)}\n.spark{width:100%;height:64px;display:block}\n.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:13px}\n.kv dt{color:var(--ink3)} .kv dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis}\n.heat td{text-align:center;font-weight:650}\n.note{font-size:12.5px;margin:10px 0 0}\n.edge-meta{font-size:13px;color:var(--ink2);margin:10px 0 4px}\n.edge{display:grid;gap:3px;padding:10px 0;border-top:1px solid var(--line)}\n.edge-rule{font-weight:700}\n.strat{display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}\n.strat.active{box-shadow:inset 3px 0 0 var(--flare);padding-left:10px}\n.inp.wide{max-width:none;flex:1;min-width:0}\n.step .stepno{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--raised);font-weight:750;font-size:13px;flex:none}\n.step.done{border-color:color-mix(in srgb,var(--good) 35%,var(--line))}\n.step.done .stepno{background:var(--good-soft);color:var(--good)}\n.steps{margin:0;padding-left:20px;display:grid;gap:6px}\n.copyline{display:flex;gap:8px;align-items:center}\n.copyline code{flex:1;min-width:0;overflow-wrap:anywhere;font-family:var(--mono);font-size:12px;background:var(--raised);padding:6px 8px;border-radius:6px}\n.linkcode{font-size:20px;letter-spacing:.12em;color:var(--flare)}\n@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}\n</style>\n</head>\n<body>\n<div id="root"></div>\n<script>"use strict";(()=>{var ge,M,je,zt,X,Ue,Ge,Qe,Ye,Ce,Me,Pe,qt,ae={},Xe=[],Ut=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,ve=Array.isArray;function G(t,n){for(var o in n)t[o]=n[o];return t}function Le(t){t&&t.parentNode&&t.parentNode.removeChild(t)}function Vt(t,n,o){var r,a,s,l={};for(s in n)s=="key"?r=n[s]:s=="ref"?a=n[s]:l[s]=n[s];if(arguments.length>2&&(l.children=arguments.length>3?ge.call(arguments,2):o),typeof t=="function"&&t.defaultProps!=null)for(s in t.defaultProps)l[s]===void 0&&(l[s]=t.defaultProps[s]);return me(t,l,r,a,null)}function me(t,n,o,r,a){var s={type:t,props:n,key:o,ref:r,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:a??++je,__i:-1,__u:0};return a==null&&M.vnode!=null&&M.vnode(s),s}function L(t){return t.children}function he(t,n){this.props=t,this.context=n}function te(t,n){if(n==null)return t.__?te(t.__,t.__i+1):null;for(var o;n<t.__k.length;n++)if((o=t.__k[n])!=null&&o.__e!=null)return o.__e;return typeof t.type=="function"?te(t):null}function Je(t){var n,o;if((t=t.__)!=null&&t.__c!=null){for(t.__e=t.__c.base=null,n=0;n<t.__k.length;n++)if((o=t.__k[n])!=null&&o.__e!=null){t.__e=t.__c.base=o.__e;break}return Je(t)}}function Ve(t){(!t.__d&&(t.__d=!0)&&X.push(t)&&!fe.__r++||Ue!=M.debounceRendering)&&((Ue=M.debounceRendering)||Ge)(fe)}function fe(){for(var t,n,o,r,a,s,l,u=1;X.length;)X.length>u&&X.sort(Qe),t=X.shift(),u=X.length,t.__d&&(o=void 0,r=void 0,a=(r=(n=t).__v).__e,s=[],l=[],n.__P&&((o=G({},r)).__v=r.__v+1,M.vnode&&M.vnode(o),Fe(n.__P,o,r,n.__n,n.__P.namespaceURI,32&r.__u?[a]:null,s,a??te(r),!!(32&r.__u),l),o.__v=r.__v,o.__.__k[o.__i]=o,tt(s,o,l),r.__e=r.__=null,o.__e!=a&&Je(o)));fe.__r=0}function Ze(t,n,o,r,a,s,l,u,h,d,i){var c,f,m,p,k,T,v,y=r&&r.__k||Xe,H=n.length;for(h=Kt(o,n,y,h,H),c=0;c<H;c++)(m=o.__k[c])!=null&&(f=m.__i==-1?ae:y[m.__i]||ae,m.__i=c,T=Fe(t,m,f,a,s,l,u,h,d,i),p=m.__e,m.ref&&f.ref!=m.ref&&(f.ref&&Re(f.ref,null,m),i.push(m.ref,m.__c||p,m)),k==null&&p!=null&&(k=p),(v=!!(4&m.__u))||f.__k===m.__k?h=et(m,h,t,v):typeof m.type=="function"&&T!==void 0?h=T:p&&(h=p.nextSibling),m.__u&=-7);return o.__e=k,h}function Kt(t,n,o,r,a){var s,l,u,h,d,i=o.length,c=i,f=0;for(t.__k=new Array(a),s=0;s<a;s++)(l=n[s])!=null&&typeof l!="boolean"&&typeof l!="function"?(h=s+f,(l=t.__k[s]=typeof l=="string"||typeof l=="number"||typeof l=="bigint"||l.constructor==String?me(null,l,null,null,null):ve(l)?me(L,{children:l},null,null,null):l.constructor==null&&l.__b>0?me(l.type,l.props,l.key,l.ref?l.ref:null,l.__v):l).__=t,l.__b=t.__b+1,u=null,(d=l.__i=Wt(l,o,h,c))!=-1&&(c--,(u=o[d])&&(u.__u|=2)),u==null||u.__v==null?(d==-1&&(a>i?f--:a<i&&f++),typeof l.type!="function"&&(l.__u|=4)):d!=h&&(d==h-1?f--:d==h+1?f++:(d>h?f--:f++,l.__u|=4))):t.__k[s]=null;if(c)for(s=0;s<i;s++)(u=o[s])!=null&&(2&u.__u)==0&&(u.__e==r&&(r=te(u)),ot(u,u));return r}function et(t,n,o,r){var a,s;if(typeof t.type=="function"){for(a=t.__k,s=0;a&&s<a.length;s++)a[s]&&(a[s].__=t,n=et(a[s],n,o,r));return n}t.__e!=n&&(r&&(n&&t.type&&!n.parentNode&&(n=te(t)),o.insertBefore(t.__e,n||null)),n=t.__e);do n=n&&n.nextSibling;while(n!=null&&n.nodeType==8);return n}function Wt(t,n,o,r){var a,s,l,u=t.key,h=t.type,d=n[o],i=d!=null&&(2&d.__u)==0;if(d===null&&t.key==null||i&&u==d.key&&h==d.type)return o;if(r>(i?1:0)){for(a=o-1,s=o+1;a>=0||s<n.length;)if((d=n[l=a>=0?a--:s++])!=null&&(2&d.__u)==0&&u==d.key&&h==d.type)return l}return-1}function Ke(t,n,o){n[0]=="-"?t.setProperty(n,o??""):t[n]=o==null?"":typeof o!="number"||Ut.test(n)?o:o+"px"}function pe(t,n,o,r,a){var s,l;e:if(n=="style")if(typeof o=="string")t.style.cssText=o;else{if(typeof r=="string"&&(t.style.cssText=r=""),r)for(n in r)o&&n in o||Ke(t.style,n,"");if(o)for(n in o)r&&o[n]==r[n]||Ke(t.style,n,o[n])}else if(n[0]=="o"&&n[1]=="n")s=n!=(n=n.replace(Ye,"$1")),l=n.toLowerCase(),n=l in t||n=="onFocusOut"||n=="onFocusIn"?l.slice(2):n.slice(2),t.l||(t.l={}),t.l[n+s]=o,o?r?o.u=r.u:(o.u=Ce,t.addEventListener(n,s?Pe:Me,s)):t.removeEventListener(n,s?Pe:Me,s);else{if(a=="http://www.w3.org/2000/svg")n=n.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(n!="width"&&n!="height"&&n!="href"&&n!="list"&&n!="form"&&n!="tabIndex"&&n!="download"&&n!="rowSpan"&&n!="colSpan"&&n!="role"&&n!="popover"&&n in t)try{t[n]=o??"";break e}catch{}typeof o=="function"||(o==null||o===!1&&n[4]!="-"?t.removeAttribute(n):t.setAttribute(n,n=="popover"&&o==1?"":o))}}function We(t){return function(n){if(this.l){var o=this.l[n.type+t];if(n.t==null)n.t=Ce++;else if(n.t<o.u)return;return o(M.event?M.event(n):n)}}}function Fe(t,n,o,r,a,s,l,u,h,d){var i,c,f,m,p,k,T,v,y,H,D,I,g,B,C,Y,re,U=n.type;if(n.constructor!=null)return null;128&o.__u&&(h=!!(32&o.__u),s=[u=n.__e=o.__e]),(i=M.__b)&&i(n);e:if(typeof U=="function")try{if(v=n.props,y="prototype"in U&&U.prototype.render,H=(i=U.contextType)&&r[i.__c],D=i?H?H.props.value:i.__:r,o.__c?T=(c=n.__c=o.__c).__=c.__E:(y?n.__c=c=new U(v,D):(n.__c=c=new he(v,D),c.constructor=U,c.render=Gt),H&&H.sub(c),c.props=v,c.state||(c.state={}),c.context=D,c.__n=r,f=c.__d=!0,c.__h=[],c._sb=[]),y&&c.__s==null&&(c.__s=c.state),y&&U.getDerivedStateFromProps!=null&&(c.__s==c.state&&(c.__s=G({},c.__s)),G(c.__s,U.getDerivedStateFromProps(v,c.__s))),m=c.props,p=c.state,c.__v=n,f)y&&U.getDerivedStateFromProps==null&&c.componentWillMount!=null&&c.componentWillMount(),y&&c.componentDidMount!=null&&c.__h.push(c.componentDidMount);else{if(y&&U.getDerivedStateFromProps==null&&v!==m&&c.componentWillReceiveProps!=null&&c.componentWillReceiveProps(v,D),!c.__e&&c.shouldComponentUpdate!=null&&c.shouldComponentUpdate(v,c.__s,D)===!1||n.__v==o.__v){for(n.__v!=o.__v&&(c.props=v,c.state=c.__s,c.__d=!1),n.__e=o.__e,n.__k=o.__k,n.__k.some(function(q){q&&(q.__=n)}),I=0;I<c._sb.length;I++)c.__h.push(c._sb[I]);c._sb=[],c.__h.length&&l.push(c);break e}c.componentWillUpdate!=null&&c.componentWillUpdate(v,c.__s,D),y&&c.componentDidUpdate!=null&&c.__h.push(function(){c.componentDidUpdate(m,p,k)})}if(c.context=D,c.props=v,c.__P=t,c.__e=!1,g=M.__r,B=0,y){for(c.state=c.__s,c.__d=!1,g&&g(n),i=c.render(c.props,c.state,c.context),C=0;C<c._sb.length;C++)c.__h.push(c._sb[C]);c._sb=[]}else do c.__d=!1,g&&g(n),i=c.render(c.props,c.state,c.context),c.state=c.__s;while(c.__d&&++B<25);c.state=c.__s,c.getChildContext!=null&&(r=G(G({},r),c.getChildContext())),y&&!f&&c.getSnapshotBeforeUpdate!=null&&(k=c.getSnapshotBeforeUpdate(m,p)),Y=i,i!=null&&i.type===L&&i.key==null&&(Y=nt(i.props.children)),u=Ze(t,ve(Y)?Y:[Y],n,o,r,a,s,l,u,h,d),c.base=n.__e,n.__u&=-161,c.__h.length&&l.push(c),T&&(c.__E=c.__=null)}catch(q){if(n.__v=null,h||s!=null)if(q.then){for(n.__u|=h?160:128;u&&u.nodeType==8&&u.nextSibling;)u=u.nextSibling;s[s.indexOf(u)]=null,n.__e=u}else{for(re=s.length;re--;)Le(s[re]);Ee(n)}else n.__e=o.__e,n.__k=o.__k,q.then||Ee(n);M.__e(q,n,o)}else s==null&&n.__v==o.__v?(n.__k=o.__k,n.__e=o.__e):u=n.__e=jt(o.__e,n,o,r,a,s,l,h,d);return(i=M.diffed)&&i(n),128&n.__u?void 0:u}function Ee(t){t&&t.__c&&(t.__c.__e=!0),t&&t.__k&&t.__k.forEach(Ee)}function tt(t,n,o){for(var r=0;r<o.length;r++)Re(o[r],o[++r],o[++r]);M.__c&&M.__c(n,t),t.some(function(a){try{t=a.__h,a.__h=[],t.some(function(s){s.call(a)})}catch(s){M.__e(s,a.__v)}})}function nt(t){return typeof t!="object"||t==null||t.__b&&t.__b>0?t:ve(t)?t.map(nt):G({},t)}function jt(t,n,o,r,a,s,l,u,h){var d,i,c,f,m,p,k,T=o.props,v=n.props,y=n.type;if(y=="svg"?a="http://www.w3.org/2000/svg":y=="math"?a="http://www.w3.org/1998/Math/MathML":a||(a="http://www.w3.org/1999/xhtml"),s!=null){for(d=0;d<s.length;d++)if((m=s[d])&&"setAttribute"in m==!!y&&(y?m.localName==y:m.nodeType==3)){t=m,s[d]=null;break}}if(t==null){if(y==null)return document.createTextNode(v);t=document.createElementNS(a,y,v.is&&v),u&&(M.__m&&M.__m(n,s),u=!1),s=null}if(y==null)T===v||u&&t.data==v||(t.data=v);else{if(s=s&&ge.call(t.childNodes),T=o.props||ae,!u&&s!=null)for(T={},d=0;d<t.attributes.length;d++)T[(m=t.attributes[d]).name]=m.value;for(d in T)if(m=T[d],d!="children"){if(d=="dangerouslySetInnerHTML")c=m;else if(!(d in v)){if(d=="value"&&"defaultValue"in v||d=="checked"&&"defaultChecked"in v)continue;pe(t,d,null,m,a)}}for(d in v)m=v[d],d=="children"?f=m:d=="dangerouslySetInnerHTML"?i=m:d=="value"?p=m:d=="checked"?k=m:u&&typeof m!="function"||T[d]===m||pe(t,d,m,T[d],a);if(i)u||c&&(i.__html==c.__html||i.__html==t.innerHTML)||(t.innerHTML=i.__html),n.__k=[];else if(c&&(t.innerHTML=""),Ze(n.type=="template"?t.content:t,ve(f)?f:[f],n,o,r,y=="foreignObject"?"http://www.w3.org/1999/xhtml":a,s,l,s?s[0]:o.__k&&te(o,0),u,h),s!=null)for(d=s.length;d--;)Le(s[d]);u||(d="value",y=="progress"&&p==null?t.removeAttribute("value"):p!=null&&(p!==t[d]||y=="progress"&&!p||y=="option"&&p!=T[d])&&pe(t,d,p,T[d],a),d="checked",k!=null&&k!=t[d]&&pe(t,d,k,T[d],a))}return t}function Re(t,n,o){try{if(typeof t=="function"){var r=typeof t.__u=="function";r&&t.__u(),r&&n==null||(t.__u=t(n))}else t.current=n}catch(a){M.__e(a,o)}}function ot(t,n,o){var r,a;if(M.unmount&&M.unmount(t),(r=t.ref)&&(r.current&&r.current!=t.__e||Re(r,null,n)),(r=t.__c)!=null){if(r.componentWillUnmount)try{r.componentWillUnmount()}catch(s){M.__e(s,n)}r.base=r.__P=null}if(r=t.__k)for(a=0;a<r.length;a++)r[a]&&ot(r[a],n,o||typeof t.type!="function");o||Le(t.__e),t.__c=t.__=t.__e=void 0}function Gt(t,n,o){return this.constructor(t,o)}function st(t,n,o){var r,a,s,l;n==document&&(n=document.documentElement),M.__&&M.__(t,n),a=(r=typeof o=="function")?null:o&&o.__k||n.__k,s=[],l=[],Fe(n,t=(!r&&o||n).__k=Vt(L,null,[t]),a||ae,ae,n.namespaceURI,!r&&o?[o]:a?null:n.firstChild?ge.call(n.childNodes):null,s,!r&&o?o:a?a.__e:n.firstChild,r,l),tt(s,t,l)}ge=Xe.slice,M={__e:function(t,n,o,r){for(var a,s,l;n=n.__;)if((a=n.__c)&&!a.__)try{if((s=a.constructor)&&s.getDerivedStateFromError!=null&&(a.setState(s.getDerivedStateFromError(t)),l=a.__d),a.componentDidCatch!=null&&(a.componentDidCatch(t,r||{}),l=a.__d),l)return a.__E=a}catch(u){t=u}throw t}},je=0,zt=function(t){return t!=null&&t.constructor==null},he.prototype.setState=function(t,n){var o;o=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=G({},this.state),typeof t=="function"&&(t=t(G({},o),this.props)),t&&G(o,t),t!=null&&this.__v&&(n&&this._sb.push(n),Ve(this))},he.prototype.forceUpdate=function(t){this.__v&&(this.__e=!0,t&&this.__h.push(t),Ve(this))},he.prototype.render=L,X=[],Ge=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,Qe=function(t,n){return t.__v.__b-n.__v.__b},fe.__r=0,Ye=/(PointerCapture)$|Capture$/i,Ce=0,Me=We(!1),Pe=We(!0),qt=0;var ye,R,Ae,rt,$e=0,mt=[],$=M,at=$.__b,it=$.__r,lt=$.diffed,ct=$.__c,dt=$.unmount,ut=$.__;function ht(t,n){$.__h&&$.__h(R,t,$e||n),$e=0;var o=R.__H||(R.__H={__:[],__h:[]});return t>=o.__.length&&o.__.push({}),o.__[t]}function b(t){return $e=1,Qt(ft,t)}function Qt(t,n,o){var r=ht(ye++,2);if(r.t=t,!r.__c&&(r.__=[o?o(n):ft(void 0,n),function(u){var h=r.__N?r.__N[0]:r.__[0],d=r.t(h,u);h!==d&&(r.__N=[d,r.__[1]],r.__c.setState({}))}],r.__c=R,!R.__f)){var a=function(u,h,d){if(!r.__c.__H)return!0;var i=r.__c.__H.__.filter(function(f){return!!f.__c});if(i.every(function(f){return!f.__N}))return!s||s.call(this,u,h,d);var c=r.__c.props!==u;return i.forEach(function(f){if(f.__N){var m=f.__[0];f.__=f.__N,f.__N=void 0,m!==f.__[0]&&(c=!0)}}),s&&s.call(this,u,h,d)||c};R.__f=!0;var s=R.shouldComponentUpdate,l=R.componentWillUpdate;R.componentWillUpdate=function(u,h,d){if(this.__e){var i=s;s=void 0,a(u,h,d),s=i}l&&l.call(this,u,h,d)},R.shouldComponentUpdate=a}return r.__N||r.__}function O(t,n){var o=ht(ye++,3);!$.__s&&Jt(o.__H,n)&&(o.__=t,o.u=n,R.__H.__h.push(o))}function Yt(){for(var t;t=mt.shift();)if(t.__P&&t.__H)try{t.__H.__h.forEach(be),t.__H.__h.forEach(Oe),t.__H.__h=[]}catch(n){t.__H.__h=[],$.__e(n,t.__v)}}$.__b=function(t){R=null,at&&at(t)},$.__=function(t,n){t&&n.__k&&n.__k.__m&&(t.__m=n.__k.__m),ut&&ut(t,n)},$.__r=function(t){it&&it(t),ye=0;var n=(R=t.__c).__H;n&&(Ae===R?(n.__h=[],R.__h=[],n.__.forEach(function(o){o.__N&&(o.__=o.__N),o.u=o.__N=void 0})):(n.__h.forEach(be),n.__h.forEach(Oe),n.__h=[],ye=0)),Ae=R},$.diffed=function(t){lt&&lt(t);var n=t.__c;n&&n.__H&&(n.__H.__h.length&&(mt.push(n)!==1&&rt===$.requestAnimationFrame||((rt=$.requestAnimationFrame)||Xt)(Yt)),n.__H.__.forEach(function(o){o.u&&(o.__H=o.u),o.u=void 0})),Ae=R=null},$.__c=function(t,n){n.some(function(o){try{o.__h.forEach(be),o.__h=o.__h.filter(function(r){return!r.__||Oe(r)})}catch(r){n.some(function(a){a.__h&&(a.__h=[])}),n=[],$.__e(r,o.__v)}}),ct&&ct(t,n)},$.unmount=function(t){dt&&dt(t);var n,o=t.__c;o&&o.__H&&(o.__H.__.forEach(function(r){try{be(r)}catch(a){n=a}}),o.__H=void 0,n&&$.__e(n,o.__v))};var pt=typeof requestAnimationFrame=="function";function Xt(t){var n,o=function(){clearTimeout(r),pt&&cancelAnimationFrame(n),setTimeout(t)},r=setTimeout(o,35);pt&&(n=requestAnimationFrame(o))}function be(t){var n=R,o=t.__c;typeof o=="function"&&(t.__c=void 0,o()),R=n}function Oe(t){var n=R;t.__c=t.__(),R=n}function Jt(t,n){return!t||t.length!==n.length||n.some(function(o,r){return o!==t[r]})}function ft(t,n){return typeof n=="function"?n(t):n}function V(t,n=3){return t==null||!Number.isFinite(t)?"\\u2014":(t/1e9).toFixed(n)}function gt(t,n=3){let o=t/1e9;return`${o>0?"+":""}${o.toFixed(n)}`}function S(t,n=0,o=!1){if(t==null||!Number.isFinite(t))return"\\u2014";let r=t*100;return`${o&&r>0?"+":""}${r.toFixed(n)}%`}function W(t,n){return Number.isFinite(t)?n>0?Zt(t*n):`${t>=100?t.toFixed(0):t.toFixed(1)} SOL`:"\\u2014"}function Zt(t){if(!Number.isFinite(t))return"\\u2014";let n=Math.abs(t);return n>=1e9?`$${(t/1e9).toFixed(2)}B`:n>=1e6?`$${(t/1e6).toFixed(n>=1e7?1:2)}M`:n>=1e3?`$${(t/1e3).toFixed(n>=1e5?0:1)}k`:`$${t.toFixed(0)}`}function Q(t){return Number.isFinite(t)?t<60?`${Math.max(0,Math.round(t))}s`:t<3600?`${Math.round(t/60)}m`:t<86400?`${(t/3600).toFixed(1)}h`:`${(t/86400).toFixed(1)}d`:"\\u2014"}function _e(t,n=Date.now()){return t?`${Q((n-t)/1e3)} ago`:"\\u2014"}function J(t){return t?t.length>10?`${t.slice(0,4)}\\u2026${t.slice(-4)}`:t:"\\u2014"}function ne(t){return new Date(t).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}var vt=t=>t>=75?"b3":t>=60?"b2":"b1";var N={demo:!1,moreTabs:[]};var oe={authed:null,settings:null,account:null,rows:[],health:null,funnelHour:null,funnelDay:null,signals:[],connected:!1,solUsd:0,lastUpdate:0,skew:0,toast:"",nav:null},De=new Set;function He(){return oe}function z(t){oe={...oe,...t};for(let n of De)n()}function _(t){let[,n]=b(0);return O(()=>{let o=()=>n(r=>r+1);return De.add(o),()=>void De.delete(o)},[]),t(oe)}var Ne=null;function w(t){z({toast:t}),Ne&&clearTimeout(Ne),Ne=setTimeout(()=>z({toast:""}),3200)}function se(t,n){z({nav:{tab:t,sub:n,at:Date.now()}})}var en={async request(t,n){let o=await fetch(t,{method:n===void 0?"GET":"POST",credentials:"same-origin",headers:n===void 0?{accept:"application/json"}:{"content-type":"application/json","x-signal":"1"},body:n===void 0?void 0:JSON.stringify(n)});return{status:o.status,json:await o.json().catch(()=>({}))}},stream(t,n,o){let r=new EventSource("/api/stream");r.addEventListener("open",n),r.addEventListener("error",o);for(let a of["hello","radar","health","settings","signal","position"])r.addEventListener(a,s=>t(a,JSON.parse(s.data)));return()=>r.close()}},bt=en;async function E(t,n){let{status:o,json:r}=await bt.request(t,n);if(o===401)throw z({authed:!1}),new Error("login required");if(o>=400)throw new Error(r?.error??`HTTP ${o}`);return r}async function j(){try{let t=await E("/api/state");z({authed:!0,settings:t.settings,account:t.account,health:t.health,funnelHour:t.funnel.hour,funnelDay:t.funnel.day,signals:t.signals,solUsd:t.solUsd||oe.solUsd,skew:Date.now()-t.serverTime,lastUpdate:Date.now()})}catch{}}var Se=null;function xe(){Se?.(),Se=bt.stream((t,n)=>{switch(t){case"hello":z({settings:n.settings,account:n.account,rows:n.rows,connected:!0,lastUpdate:Date.now(),skew:Date.now()-n.serverTime});break;case"radar":z({rows:n.rows,account:n.account,lastUpdate:Date.now(),connected:!0});break;case"health":z({health:n});break;case"settings":z({settings:n});break;case"signal":z({signals:[n,...oe.signals.filter(o=>o.id!==n.id)].slice(0,200)});break;case"position":{let{position:o,what:r}=n;r==="fill"&&o.fills?.length===1&&w(`Bought $${o.symbol||"coin"} \\xB7 score ${Math.round(o.signalScore)}`),r==="close"&&w(`Sold $${o.symbol||"coin"} \\xB7 ${o.exitReason} \\xB7 ${(o.pnlPct??0).toFixed(1)}%`);break}}},()=>z({connected:!0}),()=>z({connected:!1}))}function yt(){Se?.(),Se=null}var tn=0,Fn=Array.isArray;function e(t,n,o,r,a,s){n||(n={});var l,u,h=n;if("ref"in h)for(u in h={},n)u=="ref"?l=n[u]:h[u]=n[u];var d={type:t,props:h,key:o,ref:l,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--tn,__i:-1,__u:0,__source:a,__self:s};if(typeof t=="function"&&(l=t.defaultProps))for(u in l)h[u]===void 0&&(h[u]=l[u]);return M.vnode&&M.vnode(d),d}function ke({value:t,small:n}){return e("div",{class:`score ${vt(t)}`,"aria-label":`score ${Math.round(t)}`,children:[Math.round(t),n&&e("small",{children:n})]})}function Z({id:t,checked:n,onChange:o,label:r,disabled:a}){return e("label",{class:"switch",title:r,children:[e("input",{id:t,type:"checkbox",checked:n,disabled:a,"aria-label":r,onChange:s=>o(s.target.checked)}),e("span",{})]})}function P({label:t,help:n,children:o,htmlFor:r}){return e("div",{class:"field",children:[e("div",{class:"row",children:[e("label",{for:r,style:"flex:1",children:t}),e("div",{class:"ctrl",children:o})]}),n&&e("div",{class:"help",children:n})]})}function F({id:t,value:n,onChange:o,step:r=1,min:a,max:s,suffix:l,disabled:u}){return e("span",{class:"row",style:"gap:6px",children:[e("input",{id:t,class:"inp",type:"number",inputMode:"decimal",value:n,step:r,min:a,max:s,disabled:u,onInput:h=>{let d=Number(h.target.value);Number.isFinite(d)&&o(d)}}),l&&e("span",{class:"muted",children:l})]})}function ie({k:t,v:n,s:o,tone:r}){return e("div",{class:"stat",children:[e("div",{class:"k",children:t}),e("div",{class:`v num ${r??""}`,children:n}),o!==void 0&&e("div",{class:"s",children:o})]})}function x({children:t,tone:n}){return e("span",{class:`tag ${n??""}`,children:t})}function _t({points:t,height:n=64}){if(t.length<2)return e("div",{class:"empty",style:"padding:12px",children:"Equity line appears after the first closed trade."});let o=600,r=n,a=t.map(v=>v.t),s=t.map(v=>v.v),l=Math.min(...a),u=Math.max(...a),h=Math.min(...s),d=Math.max(...s),i=(d-h)*.1||Math.abs(d)*.01||1,c=v=>(v-l)/Math.max(1,u-l)*(o-8)+4,f=v=>r-4-(v-(h-i))/(d+i-(h-i))*(r-8),m=t.map((v,y)=>`${y?"L":"M"}${c(v.t).toFixed(1)},${f(v.v).toFixed(1)}`).join(" "),p=t[t.length-1],T=p.v>=t[0].v?"var(--good)":"var(--bad)";return e("svg",{class:"spark",viewBox:`0 0 ${o} ${r}`,preserveAspectRatio:"none",role:"img","aria-label":"equity over time",children:[e("line",{x1:"0",x2:o,y1:f(t[0].v),y2:f(t[0].v),stroke:"var(--line2)","stroke-dasharray":"3 4","stroke-width":"1"}),e("path",{d:`${m} L${c(p.t)},${r} L${c(t[0].t)},${r} Z`,fill:T,opacity:"0.12"}),e("path",{d:m,fill:"none",stroke:T,"stroke-width":"2","vector-effect":"non-scaling-stroke"}),e("circle",{cx:c(p.t),cy:f(p.v),r:"4",fill:T})]})}function St({bins:t,threshold:n}){let o=Math.max(1,...t);return e("div",{children:[e("div",{class:"hist",role:"img","aria-label":"score distribution",children:t.map((r,a)=>e("i",{class:a*10+10>n?"hot":"",style:{height:`${Math.max(3,r/o*100)}%`},title:`${a*10}\\u2013${a*10+9}: ${r}`},a))}),e("div",{class:"row faint",style:"justify-content:space-between;font-size:11px;margin-top:4px",children:[e("span",{children:"0"}),e("span",{children:"50"}),e("span",{children:"100"})]})]})}function A({children:t}){return e("div",{class:"empty",children:t})}var xt={radar:e("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:[e("circle",{cx:"12",cy:"12",r:"9"}),e("circle",{cx:"12",cy:"12",r:"4.5"}),e("path",{d:"M12 12l6-6"})]}),trades:e("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:[e("path",{d:"M3 17l6-6 4 4 8-8"}),e("path",{d:"M14 7h7v7"})]}),bot:e("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:[e("rect",{x:"4",y:"7",width:"16",height:"12",rx:"3"}),e("path",{d:"M12 3v4M9 12h.01M15 12h.01M9 16h6"})]}),learn:e("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:e("path",{d:"M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6"})}),more:e("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:[e("circle",{cx:"5",cy:"12",r:"1.5"}),e("circle",{cx:"12",cy:"12",r:"1.5"}),e("circle",{cx:"19",cy:"12",r:"1.5"})]})};var kt={trailPct:0,takeInitials:!1,reentry:!1,tradeCurve:!0,tradeAmm:!0,scoreOnly:!0},wt=[{key:"plan",name:"Your plan",note:"Buy when a coin reaches 75 \\xB7 sell at 2\\xD7 or \\u221250% \\xB7 time limit 4 hours. Score only.",proof:"yours",settings:{...kt,minScore:75,tpPct:100,slPct:50,maxHoldMin:240}},{key:"sim-momentum",name:"Simulator finding: fast momentum",note:"Buy when a coin reaches 95 \\xB7 sell at +500% or \\u221220%, or after 10 minutes. It won in the simulator, which has more momentum than pump.fun \\u2014 paper-test it before trusting it.",proof:"unproven",settings:{...kt,minScore:95,tpPct:500,slPct:20,maxHoldMin:10}}];function Ie(t,n){for(let[o,r]of Object.entries(n))if(o==="filters"){for(let[a,s]of Object.entries(r))if(t.filters[a]!==s)return!1}else if(t[o]!==r)return!1;return!0}function we(t){let n=t.maxHoldMin>0?t.maxHoldMin>=120&&t.maxHoldMin%60===0?`${t.maxHoldMin/60} h`:`${t.maxHoldMin} min`:"no time limit";return`score \\u2265 ${t.minScore} \\xB7 +${t.tpPct}% / \\u2212${t.slPct}% \\xB7 ${n}`}function Tt(){let t=_(g=>g.settings),n=_(g=>g.funnelHour),o=_(g=>g.funnelDay),r=_(g=>g.health),a=_(g=>g.account),[s,l]=b(t),[u,h]=b(!1),[d,i]=b(!1),[c,f]=b(!1);if(O(()=>{u||l(t)},[t,u]),!s||!t)return null;let m=(g,B)=>{l({...s,[g]:B}),h(!0)},p=(g,B)=>{l({...s,filters:{...s.filters,[g]:B}}),h(!0)},k=async g=>{i(!0);try{let B=await E("/api/settings",g??s);l(B.settings),h(!1),w(g?"Updated":"Saved \\u2014 applies to new trades"),j()}catch(B){w(String(B.message))}finally{i(!1)}},T=!!r?.live&&!r.live.halted,v=o?.scored??0,y=o?.coinsAbove?.[Math.round(s.minScore)]??0,H=v>0?y/v:NaN,D=Math.max(1/6,Math.min(o?.hours??1,(r?.uptimeSec??3600)/3600)),I=v>0?y/D:NaN;return e("div",{children:[e("div",{class:`bigswitch ${t.enabled?"on":""}`,children:[e(Z,{id:"enabled",checked:t.enabled,label:"Auto-trading",onChange:g=>k({enabled:g})}),e("div",{style:"flex:1",children:[e("div",{style:"font-weight:760;font-size:16px",children:t.enabled?"Auto-trading is ON":"Auto-trading is paused"}),e("div",{class:"muted",style:"font-size:13px",children:t.enabled?`${we(t)}${t.scoreOnly?" \\xB7 score only":" \\xB7 with filters"} \\xB7 ${t.mode==="live"?"LIVE money":"paper"} \\xB7 ${N.demo?"demo: runs while this page is open (the real bot runs on a server 24/7)":"runs on the server even with this page closed"}`:"The radar keeps scoring; no new trades. Open positions are still managed."})]}),e(x,{tone:t.mode==="live"?"bad":"flare",children:t.mode==="live"?"LIVE":"PAPER"})]}),e(on,{settings:t,onApplied:()=>void j()}),e("div",{class:"grid two",style:"margin-top:12px",children:[e("div",{class:"card",children:[e("h2",{children:"Entry"}),e(P,{label:`Minimum score: ${s.minScore}`,htmlFor:"minScore",help:e(L,{children:[Number.isFinite(H)?e(L,{children:["Recently ",e("b",{children:I.toFixed(1)})," coins/hour reached this (",(H*100).toFixed(1),"% of scored coins) \\u2014 that is roughly how many chances to buy you get."]}):"Collecting data on how often coins reach each score\\u2026"," ","75 \\u2248 4\\xD7 the odds of an average coin; each +12.5 doubles the odds again."]}),children:e("span",{})}),e("input",{id:"minScore",type:"range",min:0,max:100,step:1,value:s.minScore,onInput:g=>m("minScore",Number(g.target.value)),style:"width:100%","aria-label":"minimum score"}),e("div",{class:"field",style:s.scoreOnly?"background:var(--flare-soft);border-radius:10px;padding:12px;margin:8px 0;border:0":"",children:[e("div",{class:"row",children:[e("label",{for:"scoreOnly",style:"flex:1;font-weight:700",children:"Score only"}),e(Z,{id:"scoreOnly",checked:s.scoreOnly,label:"Score only",onChange:g=>m("scoreOnly",g)})]}),e("div",{class:"help",children:"When on, the bot buys on the score alone and ignores every filter below. Your budget limits still apply (size, max open positions, daily loss, one entry per coin) \\u2014 they protect the wallet, they don\'t judge the coin."})]}),e(P,{label:"Take profit",htmlFor:"tp",help:"Net of all fees and slippage. 100 = sell at 2\\xD7.",children:e(F,{id:"tp",value:s.tpPct,onChange:g=>m("tpPct",g),min:1,suffix:"%"})}),e(P,{label:"Stop loss",htmlFor:"sl",help:"From your entry cost, fixed (not trailing). In a crash the fill can land below this \\u2014 the bot always sells.",children:e(F,{id:"sl",value:s.slPct,onChange:g=>m("slPct",g),min:1,max:99,suffix:"%"})}),e(P,{label:"Sell after",htmlFor:"hold",help:"Time limit for each trade: sells at market if neither the target nor the stop was hit by then. 0 = no limit.",children:e(F,{id:"hold",value:s.maxHoldMin,onChange:g=>m("maxHoldMin",g),min:0,suffix:"min"})}),e(P,{label:"Size per trade",htmlFor:"size",help:t.mode==="live"&&r?.live?`Server cap: ${r.live.maxPositionSol} SOL per live trade.`:"Fees included.",children:e(F,{id:"size",value:s.positionSol,onChange:g=>m("positionSol",g),step:.01,min:.001,suffix:"SOL"})}),e(P,{label:"Max open positions",htmlFor:"maxOpen",children:e(F,{id:"maxOpen",value:s.maxOpen,onChange:g=>m("maxOpen",g),min:1,max:50})}),e(P,{label:"Trade stage",help:"Bonding curve = before graduation (fast, cheap entry). Graduated = PumpSwap after migration.",children:e("div",{class:"chips",children:[e("button",{class:"chip","aria-pressed":s.tradeCurve,onClick:()=>m("tradeCurve",!s.tradeCurve),children:"Curve"}),e("button",{class:"chip","aria-pressed":s.tradeAmm,onClick:()=>m("tradeAmm",!s.tradeAmm),children:"Graduated"})]})}),e("div",{class:"row",style:"margin-top:12px;gap:8px",children:[e("button",{class:"btn primary",disabled:!u||d,onClick:()=>k(),children:d?"Saving\\u2026":u?"Save settings":"Saved"}),u&&e("button",{class:"btn ghost",onClick:()=>{l(t),h(!1)},children:"Discard"})]}),e("p",{class:"faint",style:"font-size:12px;margin:10px 0 0",children:"Open positions keep the exit settings they were bought with."})]}),e(nn,{funnel:n,threshold:t.minScore,scoreOnly:t.scoreOnly,enabled:t.enabled,open:a?.open.length??0,maxOpen:t.maxOpen})]}),e("div",{class:"card",style:"margin-top:12px",children:[e("h2",{children:["Filters ",s.scoreOnly&&e(x,{tone:"flare",children:"ignored \\u2014 score only is on"})]}),e("fieldset",{disabled:s.scoreOnly,style:"border:0;padding:0;margin:0;opacity:1",children:e("div",{style:s.scoreOnly?"opacity:.45":"",children:[e(P,{label:"Max dev holding",htmlFor:"fDev",children:e(F,{id:"fDev",value:s.filters.maxDevPct,onChange:g=>p("maxDevPct",g),suffix:"%"})}),e(P,{label:"Max top-10 holders",htmlFor:"fTop",children:e(F,{id:"fTop",value:s.filters.maxTop10Pct,onChange:g=>p("maxTop10Pct",g),suffix:"%"})}),e(P,{label:"Max launch bundle",htmlFor:"fBundle",help:"Supply bought by other wallets in the launch block.",children:e(F,{id:"fBundle",value:s.filters.maxBundlePct,onChange:g=>p("maxBundlePct",g),suffix:"%"})}),e(P,{label:"Min distinct buyers",htmlFor:"fBuyers",children:e(F,{id:"fBuyers",value:s.filters.minBuyers,onChange:g=>p("minBuyers",g)})}),e(P,{label:"Market cap window",help:"SOL, 0 = no limit",children:e("span",{class:"row",style:"gap:6px",children:[e(F,{id:"fMin",value:s.filters.minMcapSol,onChange:g=>p("minMcapSol",g)}),e("span",{class:"faint",children:"to"}),e(F,{id:"fMax",value:s.filters.maxMcapSol,onChange:g=>p("maxMcapSol",g)})]})}),e(P,{label:"Skip serial launchers",htmlFor:"fSerial",help:"Devs with more than this many launches in 24h (0 = off).",children:e(F,{id:"fSerial",value:s.filters.maxDevLaunches24h,onChange:g=>p("maxDevLaunches24h",g)})}),e(P,{label:"Skip if dev sold more than",htmlFor:"fDevSold",help:"100 = off",children:e(F,{id:"fDevSold",value:s.filters.maxDevSoldPct,onChange:g=>p("maxDevSoldPct",g),suffix:"%"})}),e(P,{label:"Require socials",htmlFor:"fSocial",children:e(Z,{id:"fSocial",checked:s.filters.requireSocials,label:"Require socials",onChange:g=>p("requireSocials",g)})})]})}),e("details",{class:"more",children:[e("summary",{children:"Advanced execution"}),e(P,{label:"Entry slippage",htmlFor:"slip",help:"How far the price may move before your buy lands. Too tight = missed entries on fast coins; the bot retries while the score holds.",children:e(F,{id:"slip",value:s.slippagePct,onChange:g=>m("slippagePct",g),suffix:"%"})}),e(P,{label:"Keep retrying a missed entry for",htmlFor:"retry",children:e(F,{id:"retry",value:s.retryWindowSec,onChange:g=>m("retryWindowSec",g),suffix:"s"})}),e(P,{label:"Score must hold for",htmlFor:"confirm",help:"Evaluations in a row at or above your score before buying \\u2014 about one per second while the coin trades. 5 skips one-off spikes and costs a few seconds; 1 buys on the first.",children:e(F,{id:"confirm",value:s.confirmTicks,onChange:g=>m("confirmTicks",g),min:1,max:20})}),e(P,{label:"Exit slippage (starts at)",htmlFor:"xslip",help:"Escalates automatically on retries \\u2014 exits always go through.",children:e(F,{id:"xslip",value:s.exitSlippagePct,onChange:g=>m("exitSlippagePct",g),suffix:"%"})}),e(P,{label:"Sell a coin that went quiet after",htmlFor:"stale",help:"No trades for this long frees the slot (0 = never).",children:e(F,{id:"stale",value:s.staleExitMin,onChange:g=>m("staleExitMin",g),suffix:"min"})}),e(P,{label:"Trailing stop after target",htmlFor:"trail",help:"When TP is reached, keep riding and sell if the value drops this much from its peak (0 = sell at TP).",children:e(F,{id:"trail",value:s.trailPct,onChange:g=>m("trailPct",g),suffix:"%"})}),e(P,{label:"Take initials at target",htmlFor:"initials",help:"At TP sell just enough to get your stake back; the rest rides with the trailing stop (40% if none set).",children:e(Z,{id:"initials",checked:s.takeInitials,label:"Take initials",onChange:g=>m("takeInitials",g)})}),e(P,{label:"Priority fee",htmlFor:"prio",children:e(F,{id:"prio",value:s.priorityFeeSol,onChange:g=>m("priorityFeeSol",g),step:1e-4,suffix:"SOL"})}),e(P,{label:"Daily loss limit",htmlFor:"dll",help:"Stops new entries for the rest of the UTC day (0 = off).",children:e(F,{id:"dll",value:s.maxDailyLossSol,onChange:g=>m("maxDailyLossSol",g),step:.05,suffix:"SOL"})}),e(P,{label:"Max trades per hour",htmlFor:"tph",children:e(F,{id:"tph",value:s.maxTradesPerHour,onChange:g=>m("maxTradesPerHour",g)})}),e(P,{label:"Buy the same coin again",htmlFor:"reentry",help:"Off: each coin gets one entry moment \\u2014 the first time it reaches your score. On: it can be bought again after dipping and coming back, which in simulation lost about 40% per trade.",children:e(Z,{id:"reentry",checked:s.reentry,label:"Re-entry",onChange:g=>m("reentry",g)})}),e(P,{label:"Auto-tune (paper only)",htmlFor:"autotune",help:"After each learning run, switch score/TP/SL to the combination with the best proven results (95% worst case must beat the current one). Never touches live settings.",children:e(Z,{id:"autotune",checked:s.autoTune,label:"Auto-tune",onChange:g=>m("autoTune",g)})}),e(P,{label:"Paper delay",htmlFor:"lat",help:"Simulated time from decision to landing on-chain. Honest paper results need a realistic delay.",children:e(F,{id:"lat",value:s.paperLatencyMs,onChange:g=>m("paperLatencyMs",g),step:100,suffix:"ms"})})]})]}),e("div",{class:"grid two",style:"margin-top:12px",children:[e("div",{class:"card",children:[e("h2",{children:"Mode"}),e("div",{class:"chips",children:[e("button",{class:"chip","aria-pressed":t.mode==="paper",onClick:()=>k({mode:"paper"}),children:"Paper"}),e("button",{class:"chip","aria-pressed":t.mode==="live",disabled:!T,onClick:()=>k({mode:"live"}),children:"Live"})]}),e("p",{class:"muted",style:"font-size:13px",children:T?`Live wallet ${r?.live?.address?.slice(0,4)}\\u2026${r?.live?.address?.slice(-4)} \\xB7 balance ${r?.live?.balanceSol?.toFixed(3)??"?"} SOL \\xB7 cap ${r?.live?.maxPositionSol} SOL/trade.`:r?.live?.halted?`Live trading halted: ${r.live.halted}.`:"Live is locked. It unlocks only when the server owner sets LIVE_TRADING and a dedicated wallet \\u2014 see Setup."}),r?.live?.halted&&e("button",{class:"btn sm",onClick:()=>E("/api/live/resume",{}).then(()=>w("Live resumed")),children:"Resume live"})]}),e("div",{class:"card",children:[e("h2",{children:"Emergency"}),c?e("div",{class:"row wrap",children:[e("b",{children:"Sell everything now?"}),e("button",{class:"btn danger",onClick:async()=>{await E("/api/kill",{on:!0,sellAll:!0}),f(!1),w("Kill switch ON \\u2014 selling"),j()},children:"Yes, sell all"}),e("button",{class:"btn",onClick:()=>f(!1),children:"Cancel"})]}):e("div",{class:"row wrap",children:[e("button",{class:"btn danger",onClick:()=>f(!0),children:"Kill switch"}),e("span",{class:"muted",style:"font-size:13px",children:"Stops all new entries and sells every open position."})]}),a?.killed&&e("button",{class:"btn sm",style:"margin-top:8px",onClick:()=>E("/api/kill",{on:!1}).then(()=>j()),children:"Turn kill switch off"})]})]})]})}function nn({funnel:t,threshold:n,scoreOnly:o,enabled:r,open:a,maxOpen:s}){if(!t)return e("div",{class:"card",children:"Loading\\u2026"});let l=r?t.scored===0?"No coins scored yet \\u2014 check that the data feeds are green (More \\u2192 Health).":t.maxScore<n?`No coin reached ${n} this hour (best was ${Math.round(t.maxScore)}). Lower the score to trade more often.`:t.signals===0?`Coins reached ${n}, but none crossed it since the bot was switched on or the threshold changed.`:a>=s?`All ${s} position slots are in use.`:t.entered>0?"Trading normally.":"Signals were blocked \\u2014 see the reasons below.":"Auto-trading is paused.";return e("div",{class:"card",children:[e("h2",{children:"Why no trade? \\xB7 last hour"}),e("p",{style:"margin:0 0 10px;font-weight:650",children:l}),e("div",{class:"stats",style:"grid-template-columns:repeat(4,1fr)",children:[e("div",{class:"stat",children:[e("div",{class:"k",children:"Coins scored"}),e("div",{class:"v num",children:t.scored})]}),e("div",{class:"stat",children:[e("div",{class:"k",children:["Reached ",n]}),e("div",{class:"v num",children:t.coinsAbove?.[Math.round(n)]??t.signals})]}),e("div",{class:"stat",children:[e("div",{class:"k",children:"Bought"}),e("div",{class:"v num good",children:t.entered})]}),e("div",{class:"stat",children:[e("div",{class:"k",children:"Missed"}),e("div",{class:"v num warn",children:t.failed})]})]}),e("div",{style:"margin:12px 0 4px",class:"faint",children:["Best score of each coin this hour (highest ",Math.round(t.maxScore),"):"]}),e(St,{bins:t.hist,threshold:n}),t.reasons.length>0&&e("div",{style:"margin-top:12px",children:[e("div",{class:"faint",style:"margin-bottom:6px",children:["Blocked because\\u2026 ",o&&e(x,{tone:"flare",children:"score only: filters skipped"})]}),e("table",{children:e("tbody",{children:t.reasons.slice(0,8).map(u=>e("tr",{children:[e("td",{children:u.text}),e("td",{class:"r num",children:u.n})]},u.reason))})})]})]})}function on({settings:t,onApplied:n}){let[o,r]=b([]),[a,s]=b(null),[l,u]=b(null);O(()=>{E("/api/edges").then(f=>r(f.report?.survivors?.slice(0,3)??[])).catch(()=>{})},[]);let h=[...wt,...o.map(f=>({key:`edge:${f.text}`,name:"Found in your data",note:`${f.text}. ${S(f.holdout.mean,1,!0)} per trade on ${f.holdout.n} trades the search never saw.`,proof:"data",settings:f.settings}))],d=t.mode==="live",i=async f=>{if(d&&a!==f.key){s(f.key);return}u(f.key);try{await E("/api/settings",f.settings),w(t.enabled?`Now trading: ${f.name}`:`Strategy set: ${f.name}. Switch Auto-trading on to start.`),s(null),n()}catch(m){w(String(m.message))}finally{u(null)}},c=!h.some(f=>Ie(t,f.settings));return e("div",{class:"card",style:"margin-top:12px",children:[e("h2",{children:"Strategy"}),e("p",{class:"faint",style:"margin:0 0 4px;font-size:12.5px",children:"One tap sets the whole rule \\u2014 entry score, which coins, take profit, stop loss and time limit. Fine-tune it below afterwards."}),c&&e("div",{class:"strat active",children:e("div",{style:"flex:1;min-width:0",children:[e("div",{class:"row wrap",style:"gap:6px",children:[e("b",{children:"Custom"}),e(x,{tone:"flare",children:"active"})]}),e("div",{class:"num",style:"font-size:13px",children:[we(t)," \\xB7 ",t.scoreOnly?"score only":"with filters"]})]})}),h.map(f=>{let m=Ie(t,f.settings);return e("div",{class:`strat ${m?"active":""}`,children:[e("div",{style:"flex:1;min-width:0",children:[e("div",{class:"row wrap",style:"gap:6px",children:[e("b",{children:f.name}),f.proof==="unproven"&&e(x,{tone:"warn",children:"unproven"}),f.proof==="data"&&e(x,{tone:"good",children:"held up on unseen data"}),m&&e(x,{tone:"flare",children:"active"})]}),e("div",{class:"num",style:"font-size:13px",children:we(f.settings)}),e("div",{class:"faint",style:"font-size:12.5px",children:f.note})]}),!m&&e("button",{class:`btn sm ${a===f.key?"danger":"primary"}`,disabled:!!l,onClick:()=>i(f),children:l===f.key?"\\u2026":a===f.key?"Tap again \\u2014 real money":"Use this"})]},f.key)}),d&&e("p",{class:"faint note",children:"You are live: switching asks for a second tap. Open positions keep the rule they were bought with."})]})}var le={initialVirtualTok:1073e12,initialVirtualSol:3e10,initialRealTok:7931e11,supply:1e15},Wn=(()=>{let t=le.initialVirtualSol*le.initialVirtualTok,n=le.initialVirtualTok-le.initialRealTok;return t/n-le.initialVirtualSol})();var ce=[25,50,75,100,150,200,300,500],de=[10,20,30,40,50,70],ee=ce.flatMap(t=>de.map(n=>({tp:t,sl:n})));var Be=[50,55,60,65,70,75,80,85,90,95];var lo=1+ee.length,co=Float64Array.from(ee,t=>1+t.tp/100),uo=Float64Array.from(ee,t=>1-t.sl/100);var ze=[0,10,30,60],yo=ee.length*ze.length,K=t=>t.f,Pt=[{key:"any",label:"any coin",test:()=>!0},{key:"curve",label:"still on the bonding curve",test:t=>t.stage==="curve",stage:"curve"},{key:"amm",label:"already graduated",test:t=>t.stage==="amm",stage:"amm"},...[40,80,150].map(t=>({key:`mcap<=${t}`,label:`market cap \\u2264 ${t} SOL`,test:n=>K(n).mcap<=t,filters:{maxMcapSol:t}})),...[80,150,300].map(t=>({key:`mcap>=${t}`,label:`market cap \\u2265 ${t} SOL`,test:n=>K(n).mcap>=t,filters:{minMcapSol:t}})),...[1,3,10].map(t=>({key:`age<=${t}m`,label:`younger than ${t} min`,test:n=>K(n).age<=t*60,filters:{maxAgeMin:t}})),...[3,10].map(t=>({key:`age>=${t}m`,label:`older than ${t} min`,test:n=>K(n).age>=t*60,filters:{minAgeSec:t*60}})),{key:"bundle<=10",label:"\\u2264 10% bundled at launch",test:t=>K(t).bundle*100<=10,filters:{maxBundlePct:10}},{key:"top10<=30",label:"top 10 holders own \\u2264 30%",test:t=>K(t).top10*100<=30,filters:{maxTop10Pct:30}},...[30,100].map(t=>({key:`buyers>=${t}`,label:`${t}+ buyers`,test:n=>K(n).buyers>=t,filters:{minBuyers:t}})),{key:"socials",label:"has socials",test:t=>K(t).socials>0,filters:{requireSocials:!0}},{key:"dev<=5",label:"dev holds \\u2264 5%",test:t=>K(t).devShare*100<=5,filters:{maxDevPct:5}},{key:"devheld",label:"dev hasn\'t sold",test:t=>K(t).devSold<=0,filters:{maxDevSoldPct:0}},{key:"onelaunch",label:"dev\'s only launch today",test:t=>K(t).launches24h<=1,filters:{maxDevLaunches24h:1}}];var _o={horizonMs:6*36e5,minHours:24,minSamples:1e3,minDiscovery:80,minHoldout:40,candidates:20,minWins:10,placeboRuns:3,seed:7};function Lt(){let t=_(i=>i.settings),n=_(i=>i.health),[o,r]=b(null),[a,s]=b(""),[l,u]=b(!1),h=()=>E("/api/learn?days=14").then(r).catch(i=>s(String(i.message??i)));if(O(()=>{h();let i=setInterval(h,6e4);return()=>clearInterval(i)},[t?.minScore,t?.tpPct,t?.slPct]),a)return e(A,{children:a});if(!o)return e(A,{children:"Loading evidence\\u2026"});let d=Math.max(.05,...o.grid.filter(i=>i.n>0).map(i=>Math.abs(i.avgRet)));return e("div",{children:[e("div",{class:"section-title",children:[e("h2",{children:"Does the score make money?"}),e("span",{class:"muted num",children:[o.samples.toLocaleString()," resolved outcomes \\xB7 ",o.spanHours.toFixed(1)," h of data"]})]}),e("div",{class:`card ${o.gate.pass,""}`,style:`border-color:${o.gate.pass?"var(--good)":"var(--line)"}`,children:[e("div",{class:"row",style:"align-items:flex-start",children:[e("div",{style:"flex:1",children:[e("div",{class:"faint",style:"font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:700",children:["Go-live check \\xB7 score \\u2265 ",o.settings.minScore,", TP ",o.settings.tpPct,"%, SL ",o.settings.slPct,"%"]}),e("div",{style:"font-size:19px;font-weight:780;margin:4px 0",children:o.gate.verdict}),e("div",{class:"muted",children:o.gate.detail})]}),e(x,{tone:o.gate.pass?"good":"warn",children:o.gate.pass?"evidence \\u2713":"paper first"})]}),e("p",{class:"faint",style:"font-size:12.5px;margin:10px 0 0",children:["Every eligible coin is followed from fixed checkpoints and at every signal, as if bought with your size and delay, until the target or the stop is hit. Break-even win rate at these settings \\u2248 ",e("b",{children:S(o.breakEven)})," (fees, delay and stop slippage included)."]})]}),e(rn,{mode:t?.mode??"paper"}),o.suggestion&&e("div",{class:"card",style:"margin-top:12px;border-color:var(--flare)",children:[e("h2",{children:"Better settings found"}),e("p",{style:"margin:0 0 10px",children:[e("b",{children:["Score \\u2265 ",o.suggestion.minScore," \\xB7 TP ",o.suggestion.tpPct,"% \\xB7 SL ",o.suggestion.slPct,"%"]})," ","\\u2014 ",o.suggestion.why,"."]}),e("div",{class:"row wrap",children:[e("button",{class:"btn primary",onClick:async()=>{try{await E("/api/settings",{minScore:o.suggestion.minScore,tpPct:o.suggestion.tpPct,slPct:o.suggestion.slPct}),w("Applied \\u2014 new trades use these settings"),h()}catch(i){w(String(i.message))}},children:"Apply"}),e("span",{class:"faint",style:"font-size:12.5px",children:"Past results can stop working. Auto-tune can do this for you in paper mode (Bot \\u2192 Advanced)."})]})]}),e("div",{class:"grid two",style:"margin-top:12px",children:[e("div",{class:"card",children:[e("h2",{children:"Score buckets \\u2192 outcome"}),o.checkpoints===0?e(A,{children:"Outcomes resolve as coins hit their targets or stops \\u2014 first rows appear within minutes, solid numbers take a few days."}):e("div",{class:"tablewrap",children:e("table",{children:[e("thead",{children:e("tr",{children:[e("th",{children:"Score"}),e("th",{class:"r",children:"n"}),e("th",{class:"r",children:"Profitable"}),e("th",{class:"r",children:"Avg result"}),e("th",{class:"r",children:"95% range"})]})}),e("tbody",{children:[...o.buckets].reverse().map(i=>e("tr",{style:i.lo>=(t?.minScore??75)-9&&i.lo<=90&&i.lo+10>(t?.minScore??75)?"background:var(--flare-soft)":"",children:[e("td",{class:"num",children:[i.lo,"\\u2013",i.hi]}),e("td",{class:"r num",children:i.n}),e("td",{class:"r num",children:i.n?S(i.winRate):"\\u2014"}),e("td",{class:`r num ${i.avgRet>0?"good":i.avgRet<0?"bad":""}`,children:i.n?S(i.avgRet,1,!0):"\\u2014"}),e("td",{class:"r num faint",children:i.n>1?`${S(i.retLo,0,!0)} \\u2026 ${S(i.retHi,0,!0)}`:"\\u2014"})]},i.lo))})]})})]}),e("div",{class:"card",children:[e("h2",{children:"Pick a threshold"}),e("p",{class:"faint",style:"margin:0 0 8px;font-size:12.5px",children:o.thresholdSource==="entries"?"What happened after coins first reached each score \\u2014 the moment the bot buys \\u2014 with your TP/SL, delay and costs.":"For now: snapshots of coins above each score. Buying the moment a coin reaches a score usually does worse; this switches to real entry outcomes after 200 of them."}),e("div",{class:"tablewrap",children:e("table",{children:[e("thead",{children:e("tr",{children:[e("th",{children:"Score \\u2265"}),e("th",{class:"r",children:"Coins/hour"}),e("th",{class:"r",children:"Profitable"}),e("th",{class:"r",children:"Avg result"})]})}),e("tbody",{children:o.thresholds.map(i=>e("tr",{style:i.min===t?.minScore?"background:var(--flare-soft)":"",children:[e("td",{class:"num",children:i.min}),e("td",{class:"r num",children:Number.isFinite(i.tokensPerHour)?i.tokensPerHour.toFixed(1):"\\u2014"}),e("td",{class:"r num",children:i.n?S(i.winRate):"\\u2014"}),e("td",{class:`r num ${i.avgRet>0?"good":i.avgRet<0?"bad":""}`,children:i.n?S(i.avgRet,1,!0):"\\u2014"})]},i.min))})]})})]})]}),e("div",{class:"card",style:"margin-top:12px",children:[e("h2",{children:["Take profit \\xD7 stop loss \\xB7 coins scoring \\u2265 ",o.settings.minScore]}),e("p",{class:"faint",style:"margin:0 0 8px;font-size:12.5px",children:["Average result per trade for each exit combination, delay and costs included, from"," ",o.gridSource==="signals"?"your own signals":o.gridSource==="entries"?"coins at the moment they first reached your score":"snapshots of coins above your score (until entry data builds up)",". Darker green = better; cells with fewer than 30 outcomes are faded."]}),e("div",{class:"tablewrap",children:e("table",{class:"heat",children:[e("thead",{children:e("tr",{children:[e("th",{children:"TP \\\\ SL"}),[...new Set(o.grid.map(i=>i.sl))].map(i=>e("th",{style:"text-align:center",children:["\\u2212",i,"%"]},i))]})}),e("tbody",{children:[...new Set(o.grid.map(i=>i.tp))].map(i=>e("tr",{children:[e("th",{children:["+",i,"%"]}),o.grid.filter(c=>c.tp===i).map(c=>{let f=Number.isFinite(c.avgRet)?Math.min(1,Math.abs(c.avgRet)/d):0,m=c.avgRet>=0?`color-mix(in srgb,var(--good) ${Math.round(f*45)}%,transparent)`:`color-mix(in srgb,var(--bad) ${Math.round(f*45)}%,transparent)`,p=c.tp===t?.tpPct&&c.sl===t?.slPct;return e("td",{style:{background:c.n?m:"transparent",opacity:c.n<30?.45:1,outline:p?"2px solid var(--flare)":"none"},title:`n=${c.n}, 95% ${S(c.retLo,1)} \\u2026 ${S(c.retHi,1)}`,children:c.n?S(c.avgRet,1,!0):"\\u2014"},c.sl)})]},i))})]})}),o.best&&e("p",{style:"margin:10px 0 0",children:["Most robust so far: ",e("b",{children:["TP ",o.best.tp,"% / SL ",o.best.sl,"%"]})," \\u2014 average ",S(o.best.avgRet,1,!0),", worst-case (95%) ",S(o.best.retLo,1,!0)," over ",o.best.n," outcomes."]})]}),e("div",{class:"grid two",style:"margin-top:12px",children:[e("div",{class:"card",children:[e("h2",{children:"Your paper results"}),e("dl",{class:"kv",children:[e("dt",{children:"Closed trades"}),e("dd",{children:o.paper.trades}),e("dt",{children:"Win rate"}),e("dd",{children:S(o.paper.winRate)}),e("dt",{children:"Profit"}),e("dd",{class:o.paper.pnlSol>=0?"good":"bad",children:[o.paper.pnlSol.toFixed(3)," SOL"]}),e("dt",{children:"Average trade"}),e("dd",{children:Number.isFinite(o.paper.avgPct)?`${o.paper.avgPct.toFixed(1)}%`:"\\u2014"}),e("dt",{children:"Profit factor"}),e("dd",{children:Number.isFinite(o.paper.profitFactor)?o.paper.profitFactor.toFixed(2):"\\u2014"}),e("dt",{children:"Worst drawdown"}),e("dd",{children:[o.paper.maxDrawdownSol.toFixed(3)," SOL"]})]})]}),e("div",{class:"card",children:[e("h2",{children:"Scoring model"}),e("dl",{class:"kv",children:[e("dt",{children:"Version"}),e("dd",{children:o.model.version}),e("dt",{children:"Source"}),e("dd",{children:o.model.source==="trained"?"trained on this server\'s data":"prior (market mechanics), self-scaled"}),o.model.training&&e(L,{children:[e("dt",{children:"Validation AUC"}),e("dd",{children:[o.model.training.valAuc?.toFixed(3)," (was ",o.model.training.priorValAuc?.toFixed(3),")"]}),e("dt",{children:"Trained on"}),e("dd",{children:[o.model.training.rows.toLocaleString()," outcomes"]})]}),e("dt",{children:"Last training"}),e("dd",{children:n?.learner?.lastRun?new Date(n.learner.lastRun).toLocaleString():"not yet"})]}),(n?.learner?.reports?.length??0)>0&&e("ul",{class:"muted",style:"font-size:12.5px;padding-left:18px",children:n.learner.reports.map(i=>e("li",{children:[i.stage,": ",i.reason]},i.stage))}),e("button",{class:"btn sm",disabled:l,onClick:async()=>{u(!0);try{let i=await E("/api/learn/run",{});w(i.reports.some(c=>c.adopted)?"New model adopted":"Current model kept"),h()}catch(i){w(String(i.message))}finally{u(!1)}},children:l?"Training\\u2026":"Retrain now"}),e("p",{class:"faint",style:"font-size:12px;margin-bottom:0",children:"The model retrains every few hours on outcomes recorded here and is swapped only when it beats the current one on newer data it did not train on."})]})]})]})}var Et=t=>t>=48?`${(t/24).toFixed(1)} days`:`${t.toFixed(0)} h`;function rn({mode:t}){let[n,o]=b(null),[r,a]=b(!1);O(()=>{E("/api/edges").then(d=>o(d.report)).catch(()=>{})},[]);let s=async()=>{a(!0);try{o((await E("/api/edges/run",{})).report)}catch(d){w(String(d.message))}finally{a(!1)}},[l,u]=b(null),h=async d=>{if(t==="live"&&l!==d.text){u(d.text);return}try{await E("/api/settings",d.settings),u(null),w("Now trading this rule \\u2014 score, exits, time limit and filters were replaced")}catch(i){w(String(i.message))}};return e("div",{class:"card",style:"margin-top:12px",children:[e("div",{class:"row",style:"align-items:flex-start",children:[e("div",{style:"flex:1",children:[e("h2",{style:"margin-bottom:4px",children:"Edge finder"}),e("div",{class:"muted",style:"font-size:13px",children:["Looks for profitable rules on its own: ",Be.length," score levels \\xD7 ",Pt.length," coin conditions \\xD7 ",ee.length*ze.length," exits (take profit ",ce[0],"\\u2013",ce[ce.length-1],"%, stop ",de[0],"\\u2013",de[de.length-1],"%, optional time limit). The best are re-checked on newer data the search never saw."]})]}),e("button",{class:"btn sm",disabled:r||n?.running,onClick:s,children:r||n?.running?"Searching\\u2026":"Search now"})]}),!n&&e("p",{class:"faint note",children:"Runs after every learning cycle, every few hours. Needs about a day of recorded market first."}),n?.status==="not_enough_data"&&e("p",{class:"faint note",children:n.note}),n?.status==="ok"&&e(L,{children:[e("p",{class:"edge-meta",children:["Scored ",e("b",{class:"num",children:n.tested.toLocaleString("en-US")})," rules on the first ",Et(n.discoveryHours),", re-checked the best ",n.candidates," on the last"," ",Et(n.holdoutHours),": ",e("b",{children:[n.survivors.length," held up"]}),\'. On shuffled data, where no rule can work, the same search "found" \',n.placebo.avgSurvivors.toFixed(1)," per run \\u2014 that is its rate of fooling itself."]}),n.survivors.slice(0,5).map(d=>e(Ct,{s:d,confirming:l===d.text,apply:h},d.text)),n.survivors.length>5&&e("details",{class:"more",children:[e("summary",{children:[n.survivors.length-5," more variations"]}),n.survivors.slice(5).map(d=>e(Ct,{s:d,confirming:l===d.text,apply:h},d.text))]}),n.survivors.length>0&&e("p",{class:"faint note",children:"Coins/day counts every coin that qualified; your size, open-position and hourly limits decide how many the bot actually takes."}),!n.survivors.length&&e("p",{class:"note",children:n.note}),n.failed.length>0&&e("details",{class:"more",children:[e("summary",{children:["Looked good, then failed on newer data (",n.failed.length,")"]}),n.failed.map(d=>e("div",{class:"edge",children:[e("div",{children:d.text}),e("div",{class:"faint num",style:"font-size:12.5px",children:[S(d.discovery.mean,1,!0)," in the search data \\u2192 ",S(d.holdout.mean,1,!0)," on the newest data (",d.holdout.n," trades)"]})]},d.text))]})]})]})}function Ct({s:t,confirming:n,apply:o}){return e("div",{class:"edge",children:[e("div",{class:"edge-rule",children:t.text}),e("div",{class:"num",style:"font-size:13px",children:[e("b",{class:t.holdout.mean>0?"good":"bad",children:S(t.holdout.mean,1,!0)})," per trade on the newest data \\xB7 worst case ",S(t.holdout.lo,1,!0)," \\xB7 ",t.holdout.n," ","trades \\xB7 ",S(t.holdout.winRate)," winners \\xB7 ~",t.tradesPerDay.toFixed(0)," coins/day"]}),e("div",{class:"faint num",style:"font-size:12.5px",children:["In the search data ",S(t.discovery.mean,1,!0)," \\xB7 every coin reaching ",t.level,", same exit: ",S(t.baseline,1,!0)]}),e("button",{class:`btn sm ${n?"danger":"primary"}`,style:"justify-self:start;margin-top:4px",onClick:()=>o(t),children:n?"Tap again \\u2014 real money":"Use this rule"})]})}var Te={bot_off:"Auto-trading is paused",kill_switch:"Kill switch is on",stage_off:"This stage is turned off in settings",non_sol_quote:"Coin is not paired with SOL",already_traded:"Already traded this coin (re-entry off)",max_open:"Max open positions reached",pending:"An order for this coin is already in flight",daily_loss_limit:"Daily loss limit reached",rate_limit:"Max trades per hour reached",feed_down:"Live data feed is down \\u2014 not trading blind",warming_up:"Learning this market\'s score scale (first minutes after install)",insufficient_balance:"Not enough SOL in the wallet",slippage:"Price moved more than your slippage before the buy landed",migrating:"Coin is migrating to PumpSwap (not tradable for a moment)",no_price:"No tradable price yet",no_liquidity:"Not enough liquidity",size_too_small:"Position size too small after fees",live_error:"Live order error",live_disabled:"Live trading is not enabled on the server","filter:mcap_min":"Market cap below your minimum","filter:mcap_max":"Market cap above your maximum","filter:dev":"Dev holds more than your limit","filter:top10":"Top 10 holders above your limit","filter:bundle":"Launch bundle above your limit","filter:buyers":"Fewer buyers than your minimum","filter:age_min":"Coin younger than your minimum age","filter:age_max":"Coin older than your maximum age","filter:socials":"No socials (you require them)","filter:serial_dev":"Dev launched too many coins today","filter:dev_sold":"Dev already sold more than your limit"};var an=20,ln=1e6/30;function cn(t,n){try{navigator.clipboard.writeText(t).then(()=>w(`${n} copied`),()=>w("Select the text and copy it"))}catch{w("Select the text and copy it")}}function ue({n:t,title:n,done:o,children:r}){return e("div",{class:`card step ${o?"done":""}`,children:[e("div",{class:"row",style:"gap:10px;margin-bottom:8px",children:[e("span",{class:"stepno",children:o?"\\u2713":t}),e("b",{style:"flex:1;font-size:15px",children:n}),o&&e(x,{tone:"good",children:"done"})]}),r]})}function Ft(){let t=_(C=>C.settings),[n,o]=b(null),[r,a]=b(!1),[s,l]=b(""),[u,h]=b(""),[d,i]=b(""),[c,f]=b(""),[m,p]=b("0.05"),[k,T]=b("0.25"),[v,y]=b(""),H=()=>E("/api/setup").then(C=>{o(C),a(!1)}).catch(()=>{});if(O(()=>{if(N.demo)return;H();let C=setInterval(H,4e3);return()=>clearInterval(C)},[]),N.demo)return e("div",{class:"card",children:[e("h2",{children:"Setup"}),e("p",{style:"margin-top:0",children:"On your own bot this page sets everything up with buttons \\u2014 no files to edit: the market-data key, Telegram alerts, a link for your phone, and going live with a wallet when you decide to."}),e("button",{class:"btn primary",onClick:()=>se("more","deploy"),children:"How to install the real bot"})]});if(!n)return e("div",{class:"empty",children:"Loading\\u2026"});let D=async(C,Y,re,U)=>{l(C);try{let q=await E(Y,re);U(q),q.restarting?a(!0):q.note&&w(q.note),H()}catch(q){w(String(q.message))}finally{l("")}},I=n.rpc.feed,g=!n.rpc.isPublic&&I?.status==="open",B=I?.mbPerDay?I.mbPerDay*an:null;return e("div",{class:"grid setup",children:[r&&e("div",{class:"banner sim",style:"margin:0;width:100%",children:"Restarting the bot to apply it \\u2014 this page reconnects by itself in a few seconds."}),e(ue,{n:1,title:"Market data (required)",done:g,children:[e("p",{class:"muted",style:"margin-top:0",children:["The bot needs a live feed of every pump.fun trade. A free Helius key gives it one: sign up at"," ",e("a",{href:"https://dashboard.helius.dev",target:"_blank",rel:"noopener",children:"dashboard.helius.dev"})," ","(Google login works), open ",e("b",{children:"API Keys"}),", copy the key and paste it here."]}),e("div",{class:"row wrap",style:"gap:8px",children:[e("input",{class:"inp wide",type:"password",autoComplete:"off",placeholder:"Helius API key",value:u,onInput:C=>h(C.target.value)}),e("button",{class:"btn primary",disabled:!u||!!s,onClick:()=>D("rpc","/api/setup/rpc",{key:u},()=>h("")),children:s==="rpc"?"Testing\\u2026":"Save and connect"})]}),e("p",{class:"faint note",children:[n.rpc.isPublic?"Now: the free public Solana endpoint \\u2014 slow and often cut off, so the bot sees few trades.":`Now: ${n.rpc.host} \\xB7 ${I?`${I.status}, ${I.msgs.toLocaleString("en-US")} messages`:"not connected"}`,B!==null&&!n.rpc.isPublic&&e(L,{children:[" ","\\xB7 about ",I.mbPerDay.toFixed(0)," MB/day \\u2248 ",Math.round(B).toLocaleString("en-US")," Helius credits/day",B>ln?" \\u2014 more than the free plan\'s ~33,000/day: expect Helius to ask for a paid plan before the month ends.":" \\u2014 within the free plan."]})]})]}),e(ue,{n:2,title:"Telegram alerts (optional)",done:n.telegram.linked,children:[n.telegram.linked?e("p",{class:"muted",style:"margin:0",children:"Linked. You get a message for every buy and sell, and can send /status, /pause, /resume, /score 75, /tp 100, /sl 50, /hold 10, /kill."}):n.telegram.code?e("p",{style:"margin:0",children:["Now open your new bot in Telegram and send it this code: ",e("b",{class:"num linkcode",children:n.telegram.code}),e("span",{class:"faint",children:" \\u2014 this page turns green when it arrives."})]}):e(L,{children:[e("ol",{class:"steps",style:"margin:0 0 8px",children:[e("li",{children:["In Telegram, open ",e("b",{children:"@BotFather"})," and send ",e("code",{children:"/newbot"}),"."]}),e("li",{children:\'Pick any name, then a username ending in "bot".\'}),e("li",{children:"Copy the token it gives you (looks like 123456789:AAH\\u2026) and paste it here."})]}),e("div",{class:"row wrap",style:"gap:8px",children:[e("input",{class:"inp wide",type:"password",autoComplete:"off",placeholder:"Bot token from @BotFather",value:d,onInput:C=>i(C.target.value)}),e("button",{class:"btn primary",disabled:!d||!!s,onClick:()=>D("tg","/api/setup/telegram",{token:d},()=>i("")),children:s==="tg"?"Checking\\u2026":"Connect"})]})]}),n.telegram.tokenSet&&e("button",{class:"btn sm ghost",style:"margin-top:6px",onClick:()=>D("tgoff","/api/setup/telegram-off",{},()=>w("Telegram disconnected")),children:"Disconnect Telegram"})]}),e(ue,{n:3,title:"Paper trading",done:!!t?.enabled&&t.mode==="paper",children:[e("p",{class:"muted",style:"margin:0 0 8px",children:["Fake money on the real market. Bot tab \\u2192 pick a ",e("b",{children:"Strategy"})," \\u2192 switch ",e("b",{children:"Auto-trading"})," on. Leave it running for days; the Learn tab tells you when the evidence is strong enough to go live."]}),e("button",{class:"btn",onClick:()=>se("bot"),children:"Open the Bot tab"})]}),e(ue,{n:4,title:"Your phone at home",done:!1,children:n.phoneUrl?e(L,{children:[e("p",{class:"muted",style:"margin:0 0 6px",children:"On the same Wi-Fi, open this link on your phone and add it to your home screen. Away from home, use Telegram."}),e("div",{class:"copyline",children:[e("code",{children:n.phoneUrl}),e("button",{class:"btn sm",onClick:()=>cn(n.phoneUrl,"Link"),children:"Copy"})]})]}):e("p",{class:"muted",style:"margin:0",children:"No home network found on this computer."})}),e(ue,{n:5,title:"Go live with real money \\u2014 only when ready",done:n.live.enabled&&n.live.ready,children:[n.live.enabled?e(L,{children:[e("p",{style:"margin:0 0 6px",children:["Live trading is allowed with wallet"," ",e("code",{children:[n.live.address?.slice(0,4),"\\u2026",n.live.address?.slice(-4)]})," ","\\xB7 max ",n.live.maxPositionSol," SOL per trade \\xB7 stops for the day after losing ",n.live.maxDailyLossSol," SOL."," ",n.live.ready?"Switch Bot tab \\u2192 Mode \\u2192 Live to start.":"The wallet is not ready yet (check More \\u2192 Health)."]}),e("div",{class:"row wrap",style:"gap:8px",children:[e("button",{class:"btn",onClick:()=>se("bot"),children:"Open the Bot tab"}),e("button",{class:"btn danger",disabled:!!s,onClick:()=>D("off","/api/setup/live-off",{},()=>w("Live trading off \\u2014 back to paper")),children:"Turn live off"})]})]}):n.privateChannel?e(L,{children:[e("ol",{class:"steps",style:"margin:0 0 10px",children:[e("li",{children:"In Phantom, create a new account used only by the bot, and send it the SOL you can afford to lose."}),e("li",{children:"Phantom \\u2192 Settings \\u2192 Manage accounts \\u2192 that account \\u2192 Show private key. Copy it."}),e("li",{children:"Paste it below. It stays on this computer and is never shown again."})]}),e("div",{class:"grid",style:"gap:8px",children:[e("input",{class:"inp wide",type:"password",autoComplete:"off",placeholder:n.live.walletSet?"Wallet saved \\u2014 paste only to replace it":"Bot wallet private key",value:c,onInput:C=>f(C.target.value)}),e("label",{class:"row",style:"gap:8px",children:[e("span",{style:"flex:1",children:"Max SOL per trade"}),e("input",{class:"inp",inputMode:"decimal",value:m,onInput:C=>p(C.target.value)})]}),e("label",{class:"row",style:"gap:8px",children:[e("span",{style:"flex:1",children:"Stop for the day after losing (SOL)"}),e("input",{class:"inp",inputMode:"decimal",value:k,onInput:C=>T(C.target.value)})]}),e("input",{class:"inp wide",autoComplete:"off",placeholder:\'Type "I understand the risk"\',value:v,onInput:C=>y(C.target.value)}),e("button",{class:"btn danger",disabled:!c&&!n.live.walletSet||!v||!!s,onClick:()=>D("live","/api/setup/live",{walletKey:c,maxPositionSol:Number(m),maxDailyLossSol:Number(k),confirm:v},C=>{f(""),y(""),w(`Live allowed for wallet ${String(C.address).slice(0,4)}\\u2026${String(C.address).slice(-4)}`)}),children:"Allow live trading"})]}),e("p",{class:"faint note",children:"After the restart, switch Bot tab \\u2192 Mode \\u2192 Live. The limits above cannot be raised from the Bot tab."})]}):e("p",{class:"muted",style:"margin:0",children:"For safety, a wallet can only be added on the computer running the bot \\u2014 open http://localhost:8787 there."}),n.live.walletSet&&n.privateChannel&&e("button",{class:"btn sm ghost",style:"margin-top:6px",onClick:()=>D("rm","/api/setup/wallet-remove",{},()=>w("Wallet removed from this bot")),children:"Remove the wallet from this bot"})]}),!n.supervised&&e("p",{class:"faint note",children:"This bot was started without its starter script, so after saving you will need to close it and start it again. Use start-windows.bat (or start-mac.command) so this happens by itself."})]})}var dn=[["signals","Signals log"],["narratives","Narratives"],["wallets","Smart wallets"],["health","Health"],["setup","Setup"]];function Rt({open:t}){let n=_(s=>s.nav),[o,r]=b(n?.tab==="more"&&n.sub?n.sub:N.moreTabs[0]?.key??"signals");O(()=>{n?.tab==="more"&&n.sub&&r(n.sub)},[n?.at]);let a=N.moreTabs.find(s=>s.key===o);return e("div",{children:[e("div",{class:"chips",style:"margin:14px 0",children:[...N.moreTabs.map(s=>[s.key,s.label]),...dn].map(([s,l])=>e("button",{class:"chip","aria-pressed":o===s,onClick:()=>r(s),children:l},s))}),a&&a.render(),o==="signals"&&e(un,{open:t}),o==="narratives"&&e(pn,{open:t}),o==="wallets"&&e(mn,{}),o==="health"&&e(hn,{}),o==="setup"&&e(L,{children:[e(Ft,{}),e(fn,{})]})]})}function un({open:t}){let n=_(r=>r.signals),o=_(r=>r.solUsd);return n.length?e("div",{class:"card flat",style:"padding:4px 8px",children:e("div",{class:"tablewrap",children:e("table",{children:[e("thead",{children:e("tr",{children:[e("th",{children:"Time"}),e("th",{children:"Coin"}),e("th",{class:"r",children:"Score"}),e("th",{class:"r",children:"Mcap"}),e("th",{children:"Decision"})]})}),e("tbody",{children:n.map(r=>e("tr",{style:"cursor:pointer",onClick:()=>t(r.mint),children:[e("td",{class:"faint num",children:ne(r.ts)}),e("td",{children:e("b",{children:["$",r.symbol||"?"]})}),e("td",{class:"r num",children:Math.round(r.score)}),e("td",{class:"r num",children:W(r.mcapSol,o)}),e("td",{style:"white-space:normal",children:[e(x,{tone:r.decision==="entered"?"good":r.decision==="blocked"?void 0:r.decision==="failed"?"warn":"flare",children:r.decision})," ",e("span",{class:"faint",children:r.reason?Te[r.reason]??r.reason:""})]})]},r.id))})]})})}):e(A,{children:"Every time a coin crosses your score it is logged here with what the bot did about it."})}function pn({open:t}){let[n,o]=b(null),r=_(a=>a.solUsd);return O(()=>{let a=()=>E("/api/narratives").then(l=>o(l.clusters)).catch(()=>o([]));a();let s=setInterval(a,15e3);return()=>clearInterval(s)},[]),n?n.length?e("div",{class:"list",children:[e("p",{class:"muted",style:"margin:0 0 4px",children:"Same idea, many coins: attention coordinates on one. Leaders (biggest market cap) tend to keep the flow; copies usually fade."}),n.map(a=>e("button",{class:"coin",onClick:()=>a.leader&&t(a.leader),children:[e("div",{class:"score b2",style:"font-size:15px",children:[a.size,e("small",{children:"COINS"})]}),e("div",{class:"body",children:[e("div",{class:"title",children:e("span",{class:"sym",children:a.key.replace(/^(t|w|tw|x):/,s=>({"t:":"$","w:":"","tw:":"tweet ","x:":"@"})[s]??"")})}),e("div",{class:"meta",children:[e("span",{children:["leader ",e("b",{children:["$",a.leaderSymbol??"?"]})," ",a.leaderName?`\\xB7 ${a.leaderName}`:""]}),e("span",{children:W(a.leaderMcap,r)}),a.leaderScore!==void 0&&e("span",{children:["score ",Math.round(a.leaderScore)]}),e("span",{children:["first ",_e(a.firstTs)]})]})]})]},a.key))]}):e(A,{children:"No narrative clusters in the last hour yet. When several coins launch around the same name, ticker or tweet, they group here \\u2014 and the market usually picks one winner."}):e(A,{children:"Loading\\u2026"})}function mn(){let[t,n]=b(null);return O(()=>{E("/api/wallets").then(n).catch(()=>n({wallets:[]}))},[]),t?e("div",{class:"card flat",children:[e("h3",{children:"Learned from the order flow"}),e("p",{class:"muted",style:"margin-top:0",children:[t.tracked?.toLocaleString()," wallets tracked \\xB7 ",e("b",{children:t.smart})," currently qualify as smart (\\u22658 closed coins, high win rate and ROI, not serial devs). They are a score input, never a copy-trade rule."]}),t.wallets.length===0?e(A,{children:"Needs a few hours of data before wallets have enough closed trades to judge."}):e("div",{class:"tablewrap",children:e("table",{children:[e("thead",{children:e("tr",{children:[e("th",{children:"Wallet"}),e("th",{class:"r",children:"Coins"}),e("th",{class:"r",children:"Win"}),e("th",{class:"r",children:"Avg ROI"}),e("th",{class:"r",children:"Profit"}),e("th",{children:"Tags"})]})}),e("tbody",{children:t.wallets.map(o=>e("tr",{children:[e("td",{class:"mono",children:N.demo?e("span",{class:"mono",children:J(o.address)}):e("a",{href:`https://solscan.io/account/${o.address}`,target:"_blank",rel:"noopener",children:J(o.address)})}),e("td",{class:"r num",children:o.closed}),e("td",{class:"r num",children:S(o.winRate)}),e("td",{class:"r num",children:S(o.avgRoi)}),e("td",{class:`r num ${o.pnl>=0?"good":"bad"}`,children:[o.pnl.toFixed(2)," SOL"]}),e("td",{children:o.tags.map(r=>e(x,{tone:r==="smart"?"good":r==="serial-dev"||r==="bundler"?"bad":void 0,children:r},r))})]},o.address))})]})})]}):e(A,{children:"Loading\\u2026"})}function hn(){let t=_(l=>l.health),n=_(l=>l.connected),[o,r]=b([]);if(O(()=>{E("/api/logs").then(l=>r(l.lines)).catch(()=>{})},[]),!t)return e(A,{children:"Loading\\u2026"});let a=Date.now(),s=t.feeds.some(l=>l.critical&&l.status==="open");return e("div",{class:"grid",children:[!s&&e("div",{class:"banner bad",style:"margin:0",children:"No live trade stream. The bot needs the Solana RPC firehose (free Helius key) or a PumpPortal API key to score coins \\u2014 see Setup & help."}),e("div",{class:"card",children:[e("h2",{children:"Data feeds"}),e("div",{class:"tablewrap",children:e("table",{children:[e("thead",{children:e("tr",{children:[e("th",{children:"Feed"}),e("th",{children:"Status"}),e("th",{class:"r",children:"Messages"}),e("th",{class:"r",children:"Last"}),e("th",{class:"r",children:"Reconnects"})]})}),e("tbody",{children:t.feeds.map(l=>e("tr",{children:[e("td",{children:[l.name," ",l.critical&&e(x,{children:"primary"})]}),e("td",{style:"white-space:normal",children:[e("span",{class:`dot ${l.status==="open"?"on":l.status==="connecting"?"mid":"off"}`,style:"display:inline-block;margin-right:6px"}),l.status,l.note?e("span",{class:"faint",children:[" \\xB7 ",l.note]}):null]}),e("td",{class:"r num",children:l.msgs.toLocaleString()}),e("td",{class:"r num",children:l.lastMsgAt?`${Math.round((a-l.lastMsgAt)/1e3)}s`:"\\u2014"}),e("td",{class:"r num",children:l.reconnects})]},l.name))})]})})]}),e("div",{class:"grid two",children:[e("div",{class:"card",children:[e("h2",{children:"Engine"}),e("dl",{class:"kv",children:[e("dt",{children:"Dashboard link"}),e("dd",{children:n?"live":"reconnecting\\u2026"}),e("dt",{children:"Uptime"}),e("dd",{children:[(t.uptimeSec/3600).toFixed(1)," h"]}),e("dt",{children:"Events processed"}),e("dd",{children:t.events?.toLocaleString()}),e("dt",{children:"Coins in memory / scored"}),e("dd",{children:[t.tokens," / ",t.scored]}),e("dt",{children:"Launches \\xB7 trades seen"}),e("dd",{children:[t.creates?.toLocaleString()," \\xB7 ",t.trades?.toLocaleString()]}),e("dt",{children:"PumpSwap swaps (unmapped)"}),e("dd",{children:[t.ammSwaps?.toLocaleString()," (",t.unmappedAmm,")"]}),e("dt",{children:"Reserve convention"}),e("dd",{children:t.ammReserveConvention}),e("dt",{children:"Wallets / smart"}),e("dd",{children:[t.wallets?.toLocaleString()," / ",t.smartWallets]}),e("dt",{children:"Outcomes tracking / resolved"}),e("dd",{children:[t.hypotheticalsOpen?.toLocaleString()," / ",t.samplesResolved?.toLocaleString()]}),e("dt",{children:"Errors \\xB7 bad events"}),e("dd",{children:[t.errors," \\xB7 ",t.badEvents]}),e("dt",{children:"Event-loop lag"}),e("dd",{children:[t.loopLagMs??0," ms"]}),e("dt",{children:"Memory \\xB7 disk"}),e("dd",{children:[t.memMb??"?"," MB \\xB7 ",t.diskMb??"?"," MB"]})]})]}),e("div",{class:"card",children:[e("h2",{children:"Server configuration"}),e("dl",{class:"kv",children:Object.entries(t.config??{}).map(([l,u])=>e(L,{children:[e("dt",{children:l}),e("dd",{children:Array.isArray(u)?u.join(", "):String(u)})]}))})]})]}),e("div",{class:"card",children:[e("h2",{children:"Recent log"}),e("div",{class:"tablewrap",style:"max-height:340px;overflow-y:auto",children:e("table",{children:e("tbody",{children:o.map((l,u)=>e("tr",{children:[e("td",{class:"faint num",children:ne(l.ts)}),e("td",{children:e(x,{tone:l.level==="error"?"bad":l.level==="warn"?"warn":void 0,children:l.level})}),e("td",{style:"white-space:normal",children:l.msg})]},u))})})})]})]})}function fn(){return e("div",{class:"card",style:"margin-top:12px",children:[e("h2",{children:"How it works"}),e("p",{style:"margin-top:0",children:"The bot runs on a computer that stays on \\u2014 yours, a VPS or a cloud container \\u2014 not in this page. Closing the browser or locking your phone does not stop it; Telegram keeps you posted when you are away."}),e("p",{class:"muted",style:"font-size:13px;margin-bottom:0",children:"Live orders are built by PumpPortal\'s local API (0.5% fee), signed on your computer (the key never leaves it), sent through your RPC and confirmed; the real fill is read back from the chain. Four errors in a row or the daily limit pause live entries; exits always go through. A stop loss is a market sell, not a guarantee: in a rug the fill can land far below it."})]})}function qe(t,n){try{let o=localStorage.getItem(`signal.${t}`);return o===null?n:JSON.parse(o)}catch{return n}}function At(t,n){try{localStorage.setItem(`signal.${t}`,JSON.stringify(n))}catch{}}function $t({open:t}){let n=_(p=>p.rows),o=_(p=>p.solUsd),r=_(p=>p.settings),[a,s]=b(qe("stage","all")),[l,u]=b(qe("sort","score")),[h,d]=b(qe("minview",0)),i=r?.minScore??75,c=n.filter(p=>(a==="all"||p.stage===a)&&p.score>=h);c=[...c].sort((p,k)=>l==="new"?k.createdAt-p.createdAt:l==="mcap"?k.mcapSol-p.mcapSol:k.score-p.score);let f=n.filter(p=>p.score>=i).length,m=(p,k,T,v,y)=>e("button",{class:"chip","aria-pressed":k===p,onClick:()=>{T(p),At(v,p)},children:y});return e("div",{children:[e("div",{class:"section-title",children:[e("h2",{children:"Live radar"}),e("span",{class:"muted num",children:[n.length," coins scored \\xB7 ",e("b",{class:"flare",children:f})," at \\u2265 ",i]})]}),e("div",{class:"row wrap",style:"gap:8px;margin-bottom:12px",children:[e("div",{class:"chips",children:[m("all",a,s,"stage","All"),m("curve",a,s,"stage","Bonding curve"),m("amm",a,s,"stage","Graduated")]}),e("div",{class:"chips",children:[m("score",l,u,"sort","Top score"),m("new",l,u,"sort","Newest"),m("mcap",l,u,"sort","Market cap")]}),e("div",{class:"chips",children:[0,50,i].map(p=>e("button",{class:"chip","aria-pressed":h===p,onClick:()=>{d(p),At("minview",p)},children:p===0?"Any score":`\\u2265 ${p}`},p))})]}),c.length===0?e(A,{children:n.length===0?"Waiting for coins\\u2026 the radar fills as launches and trades stream in.":"No coins match these filters right now."}):e("div",{class:"list",children:c.map(p=>e(gn,{r:p,solUsd:o,threshold:i,onOpen:()=>t(p.mint)},p.mint))})]})}function gn({r:t,solUsd:n,threshold:o,onOpen:r}){let a=t.why.filter(l=>l.points>0).slice(0,2),s=t.why.filter(l=>l.points<0).slice(0,1);return e("button",{class:`coin ${t.held?"held":""}`,onClick:r,children:[e(ke,{value:t.score,small:t.stage==="amm"?"DEX":"CURVE"}),e("div",{class:"body",children:[e("div",{class:"title",children:[e("span",{class:"sym",children:["$",t.symbol||"?"]}),e("span",{class:"name",children:t.name}),t.held&&e(x,{tone:"flare",children:"holding"}),t.score>=o&&!t.held&&(t.spent?e(x,{children:"passed"}):e(x,{tone:"good",children:"signal"}))]}),e("div",{class:"meta num",children:[e("span",{children:W(t.mcapSol,n)}),e("span",{children:[Q(t.ageSec)," old"]}),e("span",{class:t.net60>=0?"good":"bad",children:[t.net60>=0?"+":"",t.net60.toFixed(2)," SOL/1m"]}),e("span",{children:[t.buyers," buyers"]}),e("span",{children:["top10 ",S(t.top10)]})]}),t.stage==="curve"&&e("div",{class:"bar",title:`bonding curve ${S(t.progress)}`,children:e("i",{style:{width:`${Math.max(2,t.progress*100)}%`}})}),e("div",{class:"why",children:[a.map(l=>`\\u25B2 ${l.note||l.label}`).join("  "),s.length>0&&`  \\u25BC ${s[0].note||s[0].label}`]}),t.flags.length>0&&e("div",{class:"chips",style:"margin-top:6px",children:t.flags.slice(0,4).map(l=>e(x,{tone:/smart|leader/.test(l)?"good":/bundled|dev sold|serial|concentrated|copycat/.test(l)?"bad":void 0,children:l},l))})]})]})}function Ot({mint:t,close:n}){let o=_(i=>i.solUsd),r=_(i=>i.settings),[a,s]=b(null),[l,u]=b("");O(()=>{let i=!0,c=()=>E(`/api/token/${encodeURIComponent(t)}`).then(p=>i&&s(p)).catch(p=>i&&u(String(p.message??p)));c();let f=setInterval(c,3e3),m=p=>p.key==="Escape"&&n();return window.addEventListener("keydown",m),()=>{i=!1,clearInterval(f),window.removeEventListener("keydown",m)}},[t]);let h=a?.score,d=Math.max(8,...(h?.contributions??[]).map(i=>Math.abs(i.points)));return e("div",{class:"sheet-bg",onClick:i=>i.target===i.currentTarget&&n(),children:e("div",{class:"sheet",role:"dialog","aria-modal":"true","aria-label":"coin details",children:[e("div",{class:"grab"}),!a&&!l&&e(A,{children:"Loading\\u2026"}),l&&e(A,{children:l}),a&&e("div",{class:"grid",children:[e("div",{class:"row",style:"align-items:flex-start",children:[h&&e(ke,{value:h.score,small:a.stage==="amm"?"DEX":"CURVE"}),e("div",{style:"flex:1;min-width:0",children:[e("div",{style:"font-size:19px;font-weight:780",children:["$",a.symbol||"?"]}),e("div",{class:"muted",style:"overflow:hidden;text-overflow:ellipsis",children:a.name}),e("div",{class:"chips",style:"margin-top:6px",children:[e(x,{children:a.stage==="curve"?`curve ${S(a.progress)}`:a.stage==="amm"?"graduated \\xB7 PumpSwap":"migrating"}),h?.calibrated&&e(x,{tone:"good",children:["P(win) ",S(h.p)]}),a.narrative?.clusterSize>1&&e(x,{tone:a.narrative.isLeader?"good":"bad",children:[a.narrative.isLeader?"leads":"follows"," a ",a.narrative.clusterSize,"-coin narrative"]}),a.partial&&e(x,{tone:"warn",children:"joined late"})]})]}),e("button",{class:"btn ghost",onClick:n,"aria-label":"close",children:"\\u2715"})]}),e(vn,{d:a,threshold:r?.minScore??75,enabled:!!r?.enabled}),e("div",{class:"stats",children:[e("div",{class:"stat",children:[e("div",{class:"k",children:"Market cap"}),e("div",{class:"v num",children:W(a.mcapSol,o)}),o>0&&e("div",{class:"s num",children:[a.mcapSol.toFixed(1)," SOL"]})]}),e("div",{class:"stat",children:[e("div",{class:"k",children:"Peak"}),e("div",{class:"v num",children:W(a.athMcapSol,o)}),e("div",{class:"s num",children:a.mcapSol>0?`${((a.mcapSol/a.athMcapSol-1)*100).toFixed(0)}% from peak`:""})]}),e("div",{class:"stat",children:[e("div",{class:"k",children:"Age"}),e("div",{class:"v num",children:Q((Date.now()-a.createdAt)/1e3)})]}),e("div",{class:"stat",children:[e("div",{class:"k",children:"Holders"}),e("div",{class:"v num",children:a.concentration?.holders??"\\u2014"}),e("div",{class:"s",children:["top10 ",S(a.concentration?.top10)]})]})]}),e("div",{class:"row wrap",style:"gap:8px",children:[N.demo?e("span",{class:"faint",style:"font-size:12.5px",children:"Simulated coin \\u2014 no explorer links in the demo."}):e(L,{children:[e("a",{class:"btn sm",href:`https://pump.fun/coin/${a.mint}`,target:"_blank",rel:"noopener",children:"pump.fun"}),e("a",{class:"btn sm",href:`https://dexscreener.com/solana/${a.mint}`,target:"_blank",rel:"noopener",children:"DexScreener"}),e("a",{class:"btn sm",href:`https://solscan.io/token/${a.mint}`,target:"_blank",rel:"noopener",children:"Solscan"}),a.meta?.twitter&&e("a",{class:"btn sm",href:a.meta.twitter,target:"_blank",rel:"noopener",children:"X / Twitter"}),a.meta?.telegram&&e("a",{class:"btn sm",href:a.meta.telegram,target:"_blank",rel:"noopener",children:"Telegram"})]}),e("button",{class:"btn sm",onClick:()=>{navigator.clipboard?.writeText(a.mint).catch(()=>{})},children:"Copy address"})]}),h&&e("div",{class:"card flat",children:[e("h3",{children:"Why this score"}),e("div",{class:"contrib",children:h.contributions.map(i=>e(L,{children:[e("div",{children:[e("div",{style:"font-weight:650",children:[i.label," ",e("span",{class:"faint num",children:["\\xB7 ",i.value]})]}),e("div",{class:"cbar","aria-hidden":"true",children:[e("span",{class:"mid"}),e("i",{style:{left:i.points>=0?"50%":`${50-Math.abs(i.points)/d*50}%`,width:`${Math.abs(i.points)/d*50}%`,background:i.points>=0?"var(--good)":"var(--bad)"}})]})]}),e("div",{class:`num ${i.points>=0?"good":"bad"}`,style:"text-align:right",children:[i.points>=0?"+":"",i.points.toFixed(1)," pts",e("div",{class:"faint",style:"font-size:11px",children:i.note})]})]}))})]}),e("div",{class:"grid two",children:[e("div",{class:"card flat",children:[e("h3",{children:"Top holders"}),a.holders.length===0?e(A,{children:"No holders tracked yet."}):e("div",{class:"tablewrap",children:e("table",{children:e("tbody",{children:a.holders.map(i=>e("tr",{children:[e("td",{class:"mono",children:e("a",{href:N.demo?void 0:`https://solscan.io/account/${i.addr}`,target:"_blank",rel:"noopener",children:J(i.addr)})}),e("td",{children:[i.dev&&e(x,{tone:"bad",children:"dev"})," ",i.bundle&&e(x,{tone:"bad",children:"bundle"})," ",i.early&&!i.bundle&&e(x,{tone:"warn",children:"sniper"})," ",i.smart&&e(x,{tone:"good",children:"smart"})]}),e("td",{class:"r num",children:[i.pct.toFixed(2),"%"]})]},i.addr))})})})]}),e("div",{class:"card flat",children:[e("h3",{children:"Latest trades"}),e("div",{class:"tablewrap",style:"max-height:320px;overflow-y:auto",children:e("table",{children:e("tbody",{children:a.trades.map((i,c)=>e("tr",{children:[e("td",{class:"faint num",children:ne(i.ts)}),e("td",{class:i.buy?"good":"bad",children:i.buy?"buy":"sell"}),e("td",{class:"r num",children:[i.sol.toFixed(3)," SOL"]}),e("td",{class:"mono faint",children:J(i.user)})]},c))})})})]})]}),a.creatorStats&&e("div",{class:"card flat",children:[e("h3",{children:"Dev"}),e("dl",{class:"kv",children:[e("dt",{children:"Wallet"}),e("dd",{class:"mono",children:e("a",{href:N.demo?void 0:`https://solscan.io/account/${a.creator}`,target:"_blank",rel:"noopener",children:J(a.creator)})}),e("dt",{children:"Launches (24h / seen)"}),e("dd",{children:[a.creatorStats.launches24h," / ",a.creatorStats.launches]}),e("dt",{children:"Best previous coin"}),e("dd",{children:a.creatorStats.best?`${a.creatorStats.best.toFixed(0)} SOL mcap`:"\\u2014"}),e("dt",{children:"Dev holds / sold"}),e("dd",{children:[S(a.features?.devShare,1)," / ",S(a.features?.devSold)]})]})]}),a.positions?.length>0&&e("div",{class:"card flat",children:[e("h3",{children:"Your trades on this coin"}),a.positions.map(i=>e("div",{class:"row",style:"justify-content:space-between;padding:6px 0",children:[e("span",{children:[i.mode," \\xB7 ",i.status," ",i.exitReason?`\\xB7 ${i.exitReason}`:""]}),e("span",{class:`num ${(i.pnl??i.proceeds+i.value-i.cost)>=0?"good":"bad"}`,children:[V((i.pnl??i.proceeds+i.value-i.cost)||0)," SOL"]})]},i.id))]})]})]})})}function vn({d:t,threshold:n,enabled:o}){let r=t.entry;if(!r)return null;let a=r.signals?.[r.signals.length-1],s=t.score?.score??0,l="",u;if(a){let h=a.decision==="entered"?"the bot bought it":a.decision==="pending"?"the bot is buying it":a.decision==="failed"?`the buy failed (${a.reason??"no fill"})`:`not bought \\u2014 ${Te[a.reason]??a.reason}`;l=a.decision==="entered"||a.decision==="pending"?"good":"warn",u=`Entry moment at ${ne(a.ts)}, score ${Math.round(a.score)}: ${h}. Each coin gets one entry moment.`}else r.spent?u="Its entry moment has passed (before the current settings, or before this session). Each coin gets one.":s>=n?(l="good",u=o?`At your score \\u2014 buying once it holds ${r.need} evaluations in a row (${r.above}/${r.need}).`:"At your score, but auto-trading is paused."):u=`Below your score of ${n}. If it gets there and holds, that is its entry moment.`;return e("div",{class:`entrymoment ${l}`,role:"status",children:u})}var bn={tp:"take profit",sl:"stop loss",trail:"trailing stop",initials:"stake back",time:"max hold time",dead:"coin went quiet",manual:"closed by you",kill:"kill switch",external:"not in wallet"};function Nt({open:t}){let n=_(s=>s.account),o=_(s=>s.solUsd);if(!n)return e(A,{children:"Loading\\u2026"});let r=n.closed.filter(s=>s.status==="closed"),a=n.wins+n.losses>0?n.wins/(n.wins+n.losses):NaN;return e("div",{children:[e("div",{class:"section-title",children:[e("h2",{children:n.mode==="live"?"Live trading":"Paper trading"}),e("span",{class:"muted",children:n.mode==="live"?"real SOL":"simulated fills on the real order flow"})]}),e("div",{class:"card",children:[e("div",{class:"stats",children:[e(ie,{k:n.mode==="live"?"Realized":"Paper equity",v:n.mode==="live"?`${V(n.realized)} SOL`:`${V(n.equity)} SOL`,s:n.mode==="live"?void 0:`cash ${V(n.paperBalance)} + open ${V(n.openValue)}`}),e(ie,{k:"Today",v:`${n.dayPnl>=0?"+":""}${V(n.dayPnl)} SOL`,tone:n.dayPnl>0?"good":n.dayPnl<0?"bad":""}),e(ie,{k:"All time",v:`${n.realized>=0?"+":""}${V(n.realized)} SOL`,tone:n.realized>0?"good":n.realized<0?"bad":"",s:`fees paid ${V(n.fees)} SOL`}),e(ie,{k:"Win rate",v:Number.isFinite(a)?`${(a*100).toFixed(0)}%`:"\\u2014",s:`${n.wins} won \\xB7 ${n.losses} lost`})]}),e("div",{style:"margin-top:10px",children:e(_t,{points:n.equityCurve})})]}),e("div",{class:"section-title",children:[e("h2",{children:"Open positions"}),e("span",{class:"muted num",children:n.open.length})]}),n.open.length===0?e(A,{children:"No open positions. When a coin reaches your score, the bot buys it here."}):e("div",{class:"list",children:n.open.map(s=>e(yn,{p:s,solUsd:o,open:t},s.id))}),e("div",{class:"section-title",children:[e("h2",{children:"Closed"}),e("span",{class:"muted num",children:[r.length," recent"]})]}),n.closed.length===0?e(A,{children:"Closed trades appear here with their exit reason and result after fees."}):e("div",{class:"card flat",style:"padding:4px 8px",children:e("div",{class:"tablewrap",children:e("table",{children:[e("thead",{children:e("tr",{children:[e("th",{children:"Coin"}),e("th",{children:"Exit"}),e("th",{class:"r",children:"Score"}),e("th",{class:"r",children:"Held"}),e("th",{class:"r",children:"Result"})]})}),e("tbody",{children:n.closed.map(s=>e("tr",{style:"cursor:pointer",onClick:()=>t(s.mint),children:[e("td",{children:[e("b",{children:["$",s.symbol||"?"]})," ",e("span",{class:"faint",children:s.mode==="live"?"live":""})]}),e("td",{children:s.status==="failed"?e(x,{tone:"warn",children:["not filled \\xB7 ",s.exitReason]}):bn[s.exitReason??""]??s.exitReason}),e("td",{class:"r num",children:Math.round(s.signalScore)}),e("td",{class:"r num",children:s.closedAt?Q((s.closedAt-s.openedAt)/1e3):"\\u2014"}),e("td",{class:`r num ${(s.pnl??0)>0?"good":(s.pnl??0)<0?"bad":""}`,children:[s.status==="failed"?"\\u2014":`${(s.pnlPct??0)>=0?"+":""}${(s.pnlPct??0).toFixed(1)}%`,e("div",{class:"faint",style:"font-size:11px",children:s.status==="failed"?"":`${V(s.pnl??0)} SOL`})]})]},s.id))})]})})})]})}function yn({p:t,solUsd:n,open:o}){let a=((t.cost>0?(t.proceeds+t.value)/t.cost:1)-1)*100,s=t.plan.tpPct,l=t.plan.slPct,u=s+l,h=Math.min(1,Math.max(0,(a+l)/u)),d=async()=>{try{await E(`/api/positions/${encodeURIComponent(t.id)}/close`,{}),w("Sell order sent")}catch(i){w(String(i.message))}};return e("div",{class:"card flat",children:[e("div",{class:"row",children:[e("button",{class:"btn ghost",style:"padding:0;min-height:0;text-align:left;flex:1",onClick:()=>o(t.mint),children:[e("div",{style:"font-weight:760;font-size:15px",children:["$",t.symbol||"?"," ",e("span",{class:"faint",style:"font-weight:500;font-size:12.5px",children:t.name})]}),e("div",{class:"muted num",style:"font-size:12.5px",children:[t.status==="opening"?"buying\\u2026":t.status==="closing"?"selling\\u2026":`held ${Q((Date.now()-t.openedAt)/1e3)}`," \\xB7 score ",Math.round(t.signalScore)," \\xB7 in at ",W(t.entryMcapSol||t.signalMcapSol,n),t.tpHit?" \\xB7 trailing":""]})]}),e("div",{style:"text-align:right",children:[e("div",{class:`num ${a>=0?"good":"bad"}`,style:"font-size:19px;font-weight:780",children:t.status==="opening"?"\\u2026":`${a>=0?"+":""}${a.toFixed(1)}%`}),e("div",{class:"faint num",style:"font-size:12px",children:[V(t.cost)," SOL in"]})]})]}),e("div",{style:"margin-top:10px",children:[e("div",{class:"row faint num",style:"justify-content:space-between;font-size:11.5px",children:[e("span",{children:["SL \\u2212",l,"%"]}),e("span",{children:"entry"}),e("span",{children:["TP +",s,"%"]})]}),e("div",{class:"cbar",style:"margin-top:4px;height:10px",children:[e("span",{class:"mid",style:{left:`${l/u*100}%`}}),e("i",{style:{left:`calc(${h*100}% - 5px)`,width:"10px",background:a>=0?"var(--good)":"var(--bad)",borderRadius:"5px"}})]})]}),e("div",{class:"row",style:"justify-content:space-between;margin-top:10px",children:[e("span",{class:"faint",style:"font-size:12px",children:t.notes.slice(-1)[0]??`opened ${_e(t.openedAt)}`}),e("button",{class:"btn sm",disabled:t.status!=="open",onClick:d,children:"Sell now"})]})]})}var Dt=[["radar","Radar"],["trades","Trades"],["bot","Bot"],["learn","Learn"],["more","More"]],Ht=t=>Dt.some(([n])=>n===t);function _n(){let t=location.hash.replace("#","");return Ht(t)?t:"radar"}function Sn(){let[t,n]=b(""),[o,r]=b(""),[a,s]=b(!1);return e("div",{class:"login",children:[e("div",{class:"brand",style:"font-size:15px;margin-bottom:18px",children:[e(It,{})," SIGNAL"]}),e("form",{class:"card",onSubmit:async u=>{u.preventDefault(),s(!0),r("");try{await E("/api/login",{token:t}),await j(),xe()}catch(h){r(String(h.message))}finally{s(!1)}},children:[e("h2",{children:"Unlock the dashboard"}),e("p",{class:"muted",style:"margin-top:0",children:"Enter the access token printed in the server log on first start (or your DASHBOARD_TOKEN)."}),e("input",{id:"token",class:"inp",style:"max-width:none",type:"password",autoComplete:"current-password",placeholder:"access token",value:t,onInput:u=>n(u.target.value)}),o&&e("p",{class:"bad",style:"margin:8px 0 0",children:o}),e("button",{class:"btn primary",style:"margin-top:12px;width:100%",disabled:a||!t,children:a?"Checking\\u2026":"Unlock"})]})]})}function It(){return e("svg",{width:"22",height:"22",viewBox:"0 0 32 32","aria-hidden":"true",children:[e("rect",{width:"32",height:"32",rx:"7",fill:"var(--ink)"}),e("path",{d:"M6 22 L12 14 L17 18 L26 8",stroke:"var(--flare)","stroke-width":"3.2",fill:"none","stroke-linecap":"round","stroke-linejoin":"round"})]})}function Bt(){let t=_(p=>p.authed),n=_(p=>p.settings),o=_(p=>p.account),r=_(p=>p.health),a=_(p=>p.connected),s=_(p=>p.toast),l=_(p=>p.nav),[u,h]=b(_n()),[d,i]=b(null);if(O(()=>{l&&Ht(l.tab)&&(h(l.tab),i(null),window.scrollTo({top:0}))},[l?.at]),O(()=>{j().then(()=>{He().authed&&xe()});let p=setInterval(()=>void j(),15e3),k=()=>{document.visibilityState==="visible"&&j().then(()=>He().authed&&xe())};return document.addEventListener("visibilitychange",k),()=>{clearInterval(p),yt(),document.removeEventListener("visibilitychange",k)}},[]),t===!1&&!N.demo)return e(Sn,{});if(t!==!0||!n)return e("div",{class:"empty",style:"margin-top:30vh",children:N.demo?"Starting the simulated market\\u2026":"Connecting to SIGNAL\\u2026"});let c=!r?.feedDown,f=p=>{h(p);try{history.replaceState(null,"",`#${p}`)}catch{}window.scrollTo({top:0})},m=o?.dayPnl??0;return e("div",{class:"app",children:[e("header",{class:"top",children:e("div",{class:"top-row",children:[e("div",{class:"brand",children:[e(It,{})," SIGNAL"]}),e("span",{class:"pill",title:c?"data feeds live":"data feed down",children:[e("span",{class:`dot ${a?c?"on":"off":"mid"}`}),n.enabled?"Trading":"Paused"," \\xB7 ",n.mode==="live"?"LIVE":"paper"]}),e("span",{class:"spacer"}),e("span",{class:`top-pnl num ${m>0?"good":m<0?"bad":"muted"}`,title:"today, SOL",children:[gt(m)," SOL"]})]})}),r?.simulated&&e("div",{class:"banner sim",children:[e("span",{style:"flex:1",children:N.demo?"DEMO \\u2014 the real engine on a simulated market in this page. Fake coins, fake money.":"SIMULATED MARKET \\u2014 demo data, not real coins or prices."}),N.bannerAction?.()]}),o?.killed&&e("div",{class:"banner bad",children:"Kill switch is ON \\u2014 no new entries."}),!N.demo&&r?.config?.rpcIsPublic&&!r.simulated&&e("div",{class:"banner sim",children:[e("span",{style:"flex:1",children:"Setup needed: the bot is on the slow public data feed. Add your free Helius key."}),e("button",{class:"btn sm",onClick:()=>se("more","setup"),children:"Set up"})]}),r&&r.feedDown&&!r.simulated&&e("div",{class:"banner bad",children:"Live data feed is down \\u2014 the bot will not open trades until it recovers."}),e("nav",{class:"tabs","aria-label":"sections",children:Dt.map(([p,k])=>e("button",{class:"tab","aria-current":u===p?"page":void 0,onClick:()=>f(p),children:[xt[p],k]},p))}),e("main",{class:"main",children:[u==="radar"&&e($t,{open:i}),u==="trades"&&e(Nt,{open:i}),u==="bot"&&e(Tt,{}),u==="learn"&&e(Lt,{}),u==="more"&&e(Rt,{open:i})]}),d&&e(Ot,{mint:d,close:()=>i(null)}),s&&e("div",{class:"toast",role:"status",children:s})]})}z({});st(e(Bt,{}),document.getElementById("root"));})();\n</script>\n</body>\n</html>\n') return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="theme-color" content="#0f1318">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<meta name="apple-mobile-web-app-title" content="SIGNAL">\n<title>SIGNAL</title>\n<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' rx=\'7\' fill=\'%230f1318\'/%3E%3Cpath d=\'M6 22 L12 14 L17 18 L26 8\' stroke=\'%23f2a93b\' stroke-width=\'3.2\' fill=\'none\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E">\n<style>\n:root{\n  --ground:#f5f6f8; --surface:#ffffff; --raised:#eef1f5; --line:#dde2ea; --line2:#c9d0db;\n  --ink:#10151c; --ink2:#4a5566; --ink3:#7a8596;\n  --flare:#b86e00; --flare-soft:#fbead0; --flare-ink:#1a1204;\n  --good:#138a5a; --good-soft:#dff3ea; --bad:#cc3340; --bad-soft:#fbe3e5; --warn:#9a7400; --warn-soft:#f7efcf; --info:#2f6fc0;\n  --shadow:0 1px 2px rgba(16,21,28,.06),0 6px 20px rgba(16,21,28,.06);\n  --r:12px; --r-sm:8px;\n  --mono:ui-monospace,"SF Mono","Cascadia Mono","JetBrains Mono",Menlo,Consolas,monospace;\n  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI Variable","Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,sans-serif;\n  color-scheme:light;\n}\n@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){\n  --ground:#0f1318; --surface:#161b22; --raised:#1d2430; --line:#262e3b; --line2:#334052;\n  --ink:#e7ebf2; --ink2:#a3adbd; --ink3:#6f7a8c;\n  --flare:#f2a93b; --flare-soft:#3a2a12; --flare-ink:#1a1204;\n  --good:#3ecf8e; --good-soft:#12301f; --bad:#ff6b6b; --bad-soft:#3a1519; --warn:#e8c547; --warn-soft:#332b0f; --info:#6aa8ff;\n  --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.25);\n  color-scheme:dark;\n}}\n:root[data-theme="dark"]{\n  --ground:#0f1318; --surface:#161b22; --raised:#1d2430; --line:#262e3b; --line2:#334052;\n  --ink:#e7ebf2; --ink2:#a3adbd; --ink3:#6f7a8c;\n  --flare:#f2a93b; --flare-soft:#3a2a12; --flare-ink:#1a1204;\n  --good:#3ecf8e; --good-soft:#12301f; --bad:#ff6b6b; --bad-soft:#3a1519; --warn:#e8c547; --warn-soft:#332b0f; --info:#6aa8ff;\n  --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.25);\n  color-scheme:dark;\n}\n*{box-sizing:border-box}\nhtml,body{margin:0;height:100%}\nbody{background:var(--ground);color:var(--ink);font:14px/1.45 var(--sans);-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}\nbutton,input,select{font:inherit;color:inherit}\na{color:var(--info);text-decoration:none}\n[hidden]{display:none!important}\n.num{font-variant-numeric:tabular-nums}\n.mono{font-family:var(--mono);font-size:12.5px}\n.muted{color:var(--ink2)} .faint{color:var(--ink3)}\n.good{color:var(--good)} .bad{color:var(--bad)} .warn{color:var(--warn)} .flare{color:var(--flare)}\n\n/* shell */\n.app{min-height:100%;display:flex;flex-direction:column}\n.top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--ground) 88%,transparent);backdrop-filter:saturate(1.4) blur(12px);-webkit-backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--line);padding:calc(env(safe-area-inset-top,0px) + 10px) 16px 10px}\n.top-row{display:flex;align-items:center;gap:10px;max-width:1180px;margin:0 auto}\n.brand{display:flex;align-items:center;gap:8px;font-weight:750;letter-spacing:.14em;font-size:13px}\n.brand svg{flex:none}\n.pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:650;border:1px solid var(--line);background:var(--surface);white-space:nowrap}\n.dot{width:8px;height:8px;border-radius:50%;background:var(--ink3);flex:none}\n.dot.on{background:var(--good);box-shadow:0 0 0 3px color-mix(in srgb,var(--good) 22%,transparent)}\n.dot.off{background:var(--bad)} .dot.mid{background:var(--warn)}\n.spacer{flex:1}\n.top-pnl{font-weight:700;font-size:15px;white-space:nowrap}\n.main{flex:1;width:100%;max-width:1180px;margin:0 auto;padding:14px 16px calc(84px + env(safe-area-inset-bottom,0px))}\n.tabs{position:fixed;left:0;right:0;bottom:0;z-index:30;display:flex;justify-content:space-around;background:color-mix(in srgb,var(--surface) 94%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);padding:6px 6px calc(6px + env(safe-area-inset-bottom,0px))}\n.tab{flex:1;max-width:120px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px;border:0;background:none;border-radius:10px;color:var(--ink3);font-size:11px;font-weight:600;cursor:pointer}\n.tab svg{width:22px;height:22px}\n.tab[aria-current="page"]{color:var(--flare)}\n.tab:focus-visible,.btn:focus-visible,.chip:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--flare);outline-offset:2px}\n@media (min-width:900px){\n  .tabs{position:sticky;top:57px;bottom:auto;justify-content:flex-start;gap:4px;padding:6px 16px;border-top:0;border-bottom:1px solid var(--line);background:var(--ground)}\n  .tab{flex:none;flex-direction:row;gap:8px;font-size:13px;padding:8px 14px;max-width:none}\n  .tab svg{width:18px;height:18px}\n  .tab[aria-current="page"]{background:var(--flare-soft)}\n  .main{padding-bottom:40px}\n}\n.banner{max-width:1180px;width:calc(100% - 32px);margin:10px auto 0;padding:10px 14px;border-radius:var(--r-sm);font-weight:600;font-size:13px;display:flex;gap:10px;align-items:center}\n.banner.sim{background:var(--warn-soft);color:var(--warn);border:1px solid color-mix(in srgb,var(--warn) 30%,transparent)}\n.banner.bad{background:var(--bad-soft);color:var(--bad);border:1px solid color-mix(in srgb,var(--bad) 30%,transparent)}\n\n/* building blocks */\n.grid{display:grid;gap:12px}\n.grid > *{min-width:0}\n.main{overflow-x:clip}\n@media (min-width:760px){.grid.two{grid-template-columns:1fr 1fr}.grid.three{grid-template-columns:repeat(3,1fr)}}\n.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:14px;box-shadow:var(--shadow)}\n.card.flat{box-shadow:none}\n.card h2,.card h3{margin:0 0 10px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2);font-weight:700}\n.section-title{display:flex;align-items:baseline;gap:10px;margin:18px 2px 10px}\n.section-title h2{margin:0;font-size:17px;font-weight:720;text-wrap:balance}\n.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}\n@media (min-width:640px){.stats{grid-template-columns:repeat(4,1fr)}}\n.stat .k{font-size:11.5px;color:var(--ink3);text-transform:uppercase;letter-spacing:.06em;font-weight:650}\n.stat .v{font-size:20px;font-weight:720;margin-top:2px}\n.stat .s{font-size:12px;color:var(--ink2)}\n.row{display:flex;align-items:center;gap:10px}\n.wrap{flex-wrap:wrap}\n.chips{display:flex;gap:6px;flex-wrap:wrap}\n.chip{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:5px 11px;font-size:12.5px;font-weight:600;cursor:pointer;color:var(--ink2)}\n.chip[aria-pressed="true"]{background:var(--ink);color:var(--ground);border-color:var(--ink)}\n.tag{display:inline-block;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:650;background:var(--raised);color:var(--ink2);white-space:nowrap}\n.tag.good{background:var(--good-soft);color:var(--good)} .tag.bad{background:var(--bad-soft);color:var(--bad)} .tag.warn{background:var(--warn-soft);color:var(--warn)} .tag.flare{background:var(--flare-soft);color:var(--flare)}\n.btn{border:1px solid var(--line2);background:var(--surface);border-radius:10px;padding:9px 14px;font-weight:650;cursor:pointer;min-height:40px}\n.btn.primary{background:var(--flare);border-color:var(--flare);color:var(--flare-ink)}\n.btn.danger{background:var(--bad);border-color:var(--bad);color:#fff}\n.btn.ghost{background:none;border-color:transparent}\n.btn.sm{min-height:32px;padding:5px 10px;font-size:12.5px}\n.btn:disabled{opacity:.5;cursor:not-allowed}\n\n/* score badge */\n.score{flex:none;width:46px;height:46px;border-radius:12px;display:grid;place-items:center;font-weight:800;font-size:17px;background:var(--raised);color:var(--ink2);position:relative}\n.score small{position:absolute;bottom:3px;font-size:8.5px;font-weight:700;letter-spacing:.06em;opacity:.8}\n.score.b1{background:var(--raised);color:var(--ink3)}\n.score.b2{background:color-mix(in srgb,var(--flare) 16%,var(--surface));color:var(--ink)}\n.score.b3{background:var(--flare);color:var(--flare-ink)}\n\n/* radar list */\n.list{display:flex;flex-direction:column;gap:8px}\n.coin{display:flex;gap:12px;align-items:flex-start;padding:12px;border-radius:var(--r);background:var(--surface);border:1px solid var(--line);cursor:pointer;text-align:left;width:100%}\n.coin:hover{border-color:var(--line2)}\n.coin.held{border-color:var(--flare);box-shadow:inset 3px 0 0 var(--flare)}\n.coin .body{flex:1;min-width:0}\n.coin .title{display:flex;align-items:baseline;gap:6px;min-width:0}\n.coin .sym{font-weight:760;font-size:15px}\n.coin .name{color:var(--ink3);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.coin .meta{display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;font-size:12.5px;color:var(--ink2)}\n.coin .why{margin-top:6px;font-size:12px;color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.coin .right{text-align:right;flex:none}\n.bar{height:5px;border-radius:3px;background:var(--raised);overflow:hidden;margin-top:6px}\n.bar > i{display:block;height:100%;background:var(--flare);border-radius:3px}\n.img{width:34px;height:34px;border-radius:9px;object-fit:cover;background:var(--raised);flex:none}\n\n/* forms */\n.field{display:flex;flex-direction:column;gap:6px;padding:12px 0;border-bottom:1px solid var(--line)}\n.field:last-child{border-bottom:0}\n.field label{font-weight:650}\n.field .help{font-size:12.5px;color:var(--ink3)}\n.field .ctrl{display:flex;align-items:center;gap:10px}\n.inp{width:100%;max-width:140px;padding:9px 11px;border-radius:10px;border:1px solid var(--line2);background:var(--ground);font-variant-numeric:tabular-nums}\ninput[type=range]{flex:1;accent-color:var(--flare);height:32px}\n.switch{position:relative;width:48px;height:28px;flex:none}\n.switch input{opacity:0;width:0;height:0;position:absolute}\n.switch span{position:absolute;inset:0;border-radius:999px;background:var(--line2);transition:.15s}\n.switch span::after{content:"";position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:.15s}\n.switch input:checked + span{background:var(--flare)}\n.switch input:checked + span::after{transform:translateX(20px)}\n.switch input:focus-visible + span{outline:2px solid var(--flare);outline-offset:2px}\n.bigswitch{display:flex;align-items:center;gap:14px;padding:14px;border-radius:var(--r);border:1px solid var(--line);background:var(--surface)}\n.bigswitch.on{border-color:var(--good);background:color-mix(in srgb,var(--good) 7%,var(--surface))}\ndetails.more{border-top:1px solid var(--line);margin-top:6px}\ndetails.more summary{cursor:pointer;padding:12px 0;font-weight:650;color:var(--ink2)}\n\n/* tables */\n.tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch}\ntable{width:100%;border-collapse:collapse;font-size:13px}\nth{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3);font-weight:700;padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap}\ntd{padding:7px 8px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums;white-space:nowrap}\ntd.r,th.r{text-align:right}\ntr:last-child td{border-bottom:0}\n\n/* contribution bars */\n.contrib{display:grid;grid-template-columns:1fr 90px;gap:4px 10px;align-items:center;font-size:12.5px}\n.cbar{position:relative;height:8px;background:var(--raised);border-radius:4px}\n.cbar i{position:absolute;top:0;bottom:0;border-radius:4px}\n.cbar .mid{position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--line2)}\n\n/* sheet */\n.sheet-bg{position:fixed;inset:0;z-index:50;background:rgba(8,10,14,.5);display:flex;align-items:flex-end;justify-content:center}\n.sheet{width:100%;max-width:760px;max-height:92vh;overflow:auto;background:var(--ground);border-radius:18px 18px 0 0;padding:16px 16px calc(24px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px rgba(0,0,0,.35)}\n@media (min-width:760px){.sheet-bg{align-items:center}.sheet{border-radius:18px;max-height:86vh}}\n.grab{width:40px;height:5px;border-radius:3px;background:var(--line2);margin:0 auto 12px}\n.entrymoment{padding:10px 12px;border-radius:var(--r-sm);background:var(--raised);color:var(--ink2);font-size:13px}\n.entrymoment.good{background:var(--good-soft);color:var(--good)}\n.entrymoment.warn{background:var(--warn-soft);color:var(--warn)}\n\n.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(90px + env(safe-area-inset-bottom,0px));z-index:60;background:var(--ink);color:var(--ground);padding:10px 16px;border-radius:12px;font-weight:650;box-shadow:var(--shadow);max-width:calc(100% - 32px)}\n.empty{padding:28px 16px;text-align:center;color:var(--ink3)}\n.login{max-width:420px;margin:12vh auto;padding:0 16px}\n.hist{display:flex;align-items:flex-end;gap:3px;height:56px}\n.hist i{flex:1;background:var(--line2);border-radius:3px 3px 0 0;min-height:2px}\n.hist i.hot{background:var(--flare)}\n.spark{width:100%;height:64px;display:block}\n.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:13px}\n.kv dt{color:var(--ink3)} .kv dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis}\n.heat td{text-align:center;font-weight:650}\n.note{font-size:12.5px;margin:10px 0 0}\n.edge-meta{font-size:13px;color:var(--ink2);margin:10px 0 4px}\n.edge{display:grid;gap:3px;padding:10px 0;border-top:1px solid var(--line)}\n.edge-rule{font-weight:700}\n.strat{display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}\n.strat.active{box-shadow:inset 3px 0 0 var(--flare);padding-left:10px}\n.inp.wide{max-width:none;flex:1;min-width:0}\n.step .stepno{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--raised);font-weight:750;font-size:13px;flex:none}\n.step.done{border-color:color-mix(in srgb,var(--good) 35%,var(--line))}\n.step.done .stepno{background:var(--good-soft);color:var(--good)}\n.steps{margin:0;padding-left:20px;display:grid;gap:6px}\n.copyline{display:flex;gap:8px;align-items:center}\n.copyline code{flex:1;min-width:0;overflow-wrap:anywhere;font-family:var(--mono);font-size:12px;background:var(--raised);padding:6px 8px;border-radius:6px}\n.linkcode{font-size:20px;letter-spacing:.12em;color:var(--flare)}\n@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}\n</style>\n</head>\n<body>\n<div id="root"></div>\n<script>"use strict";(()=>{var ge,M,je,zt,X,Ue,Ge,Qe,Ye,Ce,Me,Pe,qt,ae={},Xe=[],Ut=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,ve=Array.isArray;function G(t,n){for(var o in n)t[o]=n[o];return t}function Le(t){t&&t.parentNode&&t.parentNode.removeChild(t)}function Vt(t,n,o){var r,a,s,l={};for(s in n)s=="key"?r=n[s]:s=="ref"?a=n[s]:l[s]=n[s];if(arguments.length>2&&(l.children=arguments.length>3?ge.call(arguments,2):o),typeof t=="function"&&t.defaultProps!=null)for(s in t.defaultProps)l[s]===void 0&&(l[s]=t.defaultProps[s]);return me(t,l,r,a,null)}function me(t,n,o,r,a){var s={type:t,props:n,key:o,ref:r,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:a??++je,__i:-1,__u:0};return a==null&&M.vnode!=null&&M.vnode(s),s}function L(t){return t.children}function he(t,n){this.props=t,this.context=n}function te(t,n){if(n==null)return t.__?te(t.__,t.__i+1):null;for(var o;n<t.__k.length;n++)if((o=t.__k[n])!=null&&o.__e!=null)return o.__e;return typeof t.type=="function"?te(t):null}function Je(t){var n,o;if((t=t.__)!=null&&t.__c!=null){for(t.__e=t.__c.base=null,n=0;n<t.__k.length;n++)if((o=t.__k[n])!=null&&o.__e!=null){t.__e=t.__c.base=o.__e;break}return Je(t)}}function Ve(t){(!t.__d&&(t.__d=!0)&&X.push(t)&&!fe.__r++||Ue!=M.debounceRendering)&&((Ue=M.debounceRendering)||Ge)(fe)}function fe(){for(var t,n,o,r,a,s,l,u=1;X.length;)X.length>u&&X.sort(Qe),t=X.shift(),u=X.length,t.__d&&(o=void 0,r=void 0,a=(r=(n=t).__v).__e,s=[],l=[],n.__P&&((o=G({},r)).__v=r.__v+1,M.vnode&&M.vnode(o),Fe(n.__P,o,r,n.__n,n.__P.namespaceURI,32&r.__u?[a]:null,s,a??te(r),!!(32&r.__u),l),o.__v=r.__v,o.__.__k[o.__i]=o,tt(s,o,l),r.__e=r.__=null,o.__e!=a&&Je(o)));fe.__r=0}function Ze(t,n,o,r,a,s,l,u,h,d,i){var c,f,m,p,k,T,v,y=r&&r.__k||Xe,H=n.length;for(h=Kt(o,n,y,h,H),c=0;c<H;c++)(m=o.__k[c])!=null&&(f=m.__i==-1?ae:y[m.__i]||ae,m.__i=c,T=Fe(t,m,f,a,s,l,u,h,d,i),p=m.__e,m.ref&&f.ref!=m.ref&&(f.ref&&Re(f.ref,null,m),i.push(m.ref,m.__c||p,m)),k==null&&p!=null&&(k=p),(v=!!(4&m.__u))||f.__k===m.__k?h=et(m,h,t,v):typeof m.type=="function"&&T!==void 0?h=T:p&&(h=p.nextSibling),m.__u&=-7);return o.__e=k,h}function Kt(t,n,o,r,a){var s,l,u,h,d,i=o.length,c=i,f=0;for(t.__k=new Array(a),s=0;s<a;s++)(l=n[s])!=null&&typeof l!="boolean"&&typeof l!="function"?(h=s+f,(l=t.__k[s]=typeof l=="string"||typeof l=="number"||typeof l=="bigint"||l.constructor==String?me(null,l,null,null,null):ve(l)?me(L,{children:l},null,null,null):l.constructor==null&&l.__b>0?me(l.type,l.props,l.key,l.ref?l.ref:null,l.__v):l).__=t,l.__b=t.__b+1,u=null,(d=l.__i=Wt(l,o,h,c))!=-1&&(c--,(u=o[d])&&(u.__u|=2)),u==null||u.__v==null?(d==-1&&(a>i?f--:a<i&&f++),typeof l.type!="function"&&(l.__u|=4)):d!=h&&(d==h-1?f--:d==h+1?f++:(d>h?f--:f++,l.__u|=4))):t.__k[s]=null;if(c)for(s=0;s<i;s++)(u=o[s])!=null&&(2&u.__u)==0&&(u.__e==r&&(r=te(u)),ot(u,u));return r}function et(t,n,o,r){var a,s;if(typeof t.type=="function"){for(a=t.__k,s=0;a&&s<a.length;s++)a[s]&&(a[s].__=t,n=et(a[s],n,o,r));return n}t.__e!=n&&(r&&(n&&t.type&&!n.parentNode&&(n=te(t)),o.insertBefore(t.__e,n||null)),n=t.__e);do n=n&&n.nextSibling;while(n!=null&&n.nodeType==8);return n}function Wt(t,n,o,r){var a,s,l,u=t.key,h=t.type,d=n[o],i=d!=null&&(2&d.__u)==0;if(d===null&&t.key==null||i&&u==d.key&&h==d.type)return o;if(r>(i?1:0)){for(a=o-1,s=o+1;a>=0||s<n.length;)if((d=n[l=a>=0?a--:s++])!=null&&(2&d.__u)==0&&u==d.key&&h==d.type)return l}return-1}function Ke(t,n,o){n[0]=="-"?t.setProperty(n,o??""):t[n]=o==null?"":typeof o!="number"||Ut.test(n)?o:o+"px"}function pe(t,n,o,r,a){var s,l;e:if(n=="style")if(typeof o=="string")t.style.cssText=o;else{if(typeof r=="string"&&(t.style.cssText=r=""),r)for(n in r)o&&n in o||Ke(t.style,n,"");if(o)for(n in o)r&&o[n]==r[n]||Ke(t.style,n,o[n])}else if(n[0]=="o"&&n[1]=="n")s=n!=(n=n.replace(Ye,"$1")),l=n.toLowerCase(),n=l in t||n=="onFocusOut"||n=="onFocusIn"?l.slice(2):n.slice(2),t.l||(t.l={}),t.l[n+s]=o,o?r?o.u=r.u:(o.u=Ce,t.addEventListener(n,s?Pe:Me,s)):t.removeEventListener(n,s?Pe:Me,s);else{if(a=="http://www.w3.org/2000/svg")n=n.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(n!="width"&&n!="height"&&n!="href"&&n!="list"&&n!="form"&&n!="tabIndex"&&n!="download"&&n!="rowSpan"&&n!="colSpan"&&n!="role"&&n!="popover"&&n in t)try{t[n]=o??"";break e}catch{}typeof o=="function"||(o==null||o===!1&&n[4]!="-"?t.removeAttribute(n):t.setAttribute(n,n=="popover"&&o==1?"":o))}}function We(t){return function(n){if(this.l){var o=this.l[n.type+t];if(n.t==null)n.t=Ce++;else if(n.t<o.u)return;return o(M.event?M.event(n):n)}}}function Fe(t,n,o,r,a,s,l,u,h,d){var i,c,f,m,p,k,T,v,y,H,D,I,g,B,C,Y,re,U=n.type;if(n.constructor!=null)return null;128&o.__u&&(h=!!(32&o.__u),s=[u=n.__e=o.__e]),(i=M.__b)&&i(n);e:if(typeof U=="function")try{if(v=n.props,y="prototype"in U&&U.prototype.render,H=(i=U.contextType)&&r[i.__c],D=i?H?H.props.value:i.__:r,o.__c?T=(c=n.__c=o.__c).__=c.__E:(y?n.__c=c=new U(v,D):(n.__c=c=new he(v,D),c.constructor=U,c.render=Gt),H&&H.sub(c),c.props=v,c.state||(c.state={}),c.context=D,c.__n=r,f=c.__d=!0,c.__h=[],c._sb=[]),y&&c.__s==null&&(c.__s=c.state),y&&U.getDerivedStateFromProps!=null&&(c.__s==c.state&&(c.__s=G({},c.__s)),G(c.__s,U.getDerivedStateFromProps(v,c.__s))),m=c.props,p=c.state,c.__v=n,f)y&&U.getDerivedStateFromProps==null&&c.componentWillMount!=null&&c.componentWillMount(),y&&c.componentDidMount!=null&&c.__h.push(c.componentDidMount);else{if(y&&U.getDerivedStateFromProps==null&&v!==m&&c.componentWillReceiveProps!=null&&c.componentWillReceiveProps(v,D),!c.__e&&c.shouldComponentUpdate!=null&&c.shouldComponentUpdate(v,c.__s,D)===!1||n.__v==o.__v){for(n.__v!=o.__v&&(c.props=v,c.state=c.__s,c.__d=!1),n.__e=o.__e,n.__k=o.__k,n.__k.some(function(q){q&&(q.__=n)}),I=0;I<c._sb.length;I++)c.__h.push(c._sb[I]);c._sb=[],c.__h.length&&l.push(c);break e}c.componentWillUpdate!=null&&c.componentWillUpdate(v,c.__s,D),y&&c.componentDidUpdate!=null&&c.__h.push(function(){c.componentDidUpdate(m,p,k)})}if(c.context=D,c.props=v,c.__P=t,c.__e=!1,g=M.__r,B=0,y){for(c.state=c.__s,c.__d=!1,g&&g(n),i=c.render(c.props,c.state,c.context),C=0;C<c._sb.length;C++)c.__h.push(c._sb[C]);c._sb=[]}else do c.__d=!1,g&&g(n),i=c.render(c.props,c.state,c.context),c.state=c.__s;while(c.__d&&++B<25);c.state=c.__s,c.getChildContext!=null&&(r=G(G({},r),c.getChildContext())),y&&!f&&c.getSnapshotBeforeUpdate!=null&&(k=c.getSnapshotBeforeUpdate(m,p)),Y=i,i!=null&&i.type===L&&i.key==null&&(Y=nt(i.props.children)),u=Ze(t,ve(Y)?Y:[Y],n,o,r,a,s,l,u,h,d),c.base=n.__e,n.__u&=-161,c.__h.length&&l.push(c),T&&(c.__E=c.__=null)}catch(q){if(n.__v=null,h||s!=null)if(q.then){for(n.__u|=h?160:128;u&&u.nodeType==8&&u.nextSibling;)u=u.nextSibling;s[s.indexOf(u)]=null,n.__e=u}else{for(re=s.length;re--;)Le(s[re]);Ee(n)}else n.__e=o.__e,n.__k=o.__k,q.then||Ee(n);M.__e(q,n,o)}else s==null&&n.__v==o.__v?(n.__k=o.__k,n.__e=o.__e):u=n.__e=jt(o.__e,n,o,r,a,s,l,h,d);return(i=M.diffed)&&i(n),128&n.__u?void 0:u}function Ee(t){t&&t.__c&&(t.__c.__e=!0),t&&t.__k&&t.__k.forEach(Ee)}function tt(t,n,o){for(var r=0;r<o.length;r++)Re(o[r],o[++r],o[++r]);M.__c&&M.__c(n,t),t.some(function(a){try{t=a.__h,a.__h=[],t.some(function(s){s.call(a)})}catch(s){M.__e(s,a.__v)}})}function nt(t){return typeof t!="object"||t==null||t.__b&&t.__b>0?t:ve(t)?t.map(nt):G({},t)}function jt(t,n,o,r,a,s,l,u,h){var d,i,c,f,m,p,k,T=o.props,v=n.props,y=n.type;if(y=="svg"?a="http://www.w3.org/2000/svg":y=="math"?a="http://www.w3.org/1998/Math/MathML":a||(a="http://www.w3.org/1999/xhtml"),s!=null){for(d=0;d<s.length;d++)if((m=s[d])&&"setAttribute"in m==!!y&&(y?m.localName==y:m.nodeType==3)){t=m,s[d]=null;break}}if(t==null){if(y==null)return document.createTextNode(v);t=document.createElementNS(a,y,v.is&&v),u&&(M.__m&&M.__m(n,s),u=!1),s=null}if(y==null)T===v||u&&t.data==v||(t.data=v);else{if(s=s&&ge.call(t.childNodes),T=o.props||ae,!u&&s!=null)for(T={},d=0;d<t.attributes.length;d++)T[(m=t.attributes[d]).name]=m.value;for(d in T)if(m=T[d],d!="children"){if(d=="dangerouslySetInnerHTML")c=m;else if(!(d in v)){if(d=="value"&&"defaultValue"in v||d=="checked"&&"defaultChecked"in v)continue;pe(t,d,null,m,a)}}for(d in v)m=v[d],d=="children"?f=m:d=="dangerouslySetInnerHTML"?i=m:d=="value"?p=m:d=="checked"?k=m:u&&typeof m!="function"||T[d]===m||pe(t,d,m,T[d],a);if(i)u||c&&(i.__html==c.__html||i.__html==t.innerHTML)||(t.innerHTML=i.__html),n.__k=[];else if(c&&(t.innerHTML=""),Ze(n.type=="template"?t.content:t,ve(f)?f:[f],n,o,r,y=="foreignObject"?"http://www.w3.org/1999/xhtml":a,s,l,s?s[0]:o.__k&&te(o,0),u,h),s!=null)for(d=s.length;d--;)Le(s[d]);u||(d="value",y=="progress"&&p==null?t.removeAttribute("value"):p!=null&&(p!==t[d]||y=="progress"&&!p||y=="option"&&p!=T[d])&&pe(t,d,p,T[d],a),d="checked",k!=null&&k!=t[d]&&pe(t,d,k,T[d],a))}return t}function Re(t,n,o){try{if(typeof t=="function"){var r=typeof t.__u=="function";r&&t.__u(),r&&n==null||(t.__u=t(n))}else t.current=n}catch(a){M.__e(a,o)}}function ot(t,n,o){var r,a;if(M.unmount&&M.unmount(t),(r=t.ref)&&(r.current&&r.current!=t.__e||Re(r,null,n)),(r=t.__c)!=null){if(r.componentWillUnmount)try{r.componentWillUnmount()}catch(s){M.__e(s,n)}r.base=r.__P=null}if(r=t.__k)for(a=0;a<r.length;a++)r[a]&&ot(r[a],n,o||typeof t.type!="function");o||Le(t.__e),t.__c=t.__=t.__e=void 0}function Gt(t,n,o){return this.constructor(t,o)}function st(t,n,o){var r,a,s,l;n==document&&(n=document.documentElement),M.__&&M.__(t,n),a=(r=typeof o=="function")?null:o&&o.__k||n.__k,s=[],l=[],Fe(n,t=(!r&&o||n).__k=Vt(L,null,[t]),a||ae,ae,n.namespaceURI,!r&&o?[o]:a?null:n.firstChild?ge.call(n.childNodes):null,s,!r&&o?o:a?a.__e:n.firstChild,r,l),tt(s,t,l)}ge=Xe.slice,M={__e:function(t,n,o,r){for(var a,s,l;n=n.__;)if((a=n.__c)&&!a.__)try{if((s=a.constructor)&&s.getDerivedStateFromError!=null&&(a.setState(s.getDerivedStateFromError(t)),l=a.__d),a.componentDidCatch!=null&&(a.componentDidCatch(t,r||{}),l=a.__d),l)return a.__E=a}catch(u){t=u}throw t}},je=0,zt=function(t){return t!=null&&t.constructor==null},he.prototype.setState=function(t,n){var o;o=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=G({},this.state),typeof t=="function"&&(t=t(G({},o),this.props)),t&&G(o,t),t!=null&&this.__v&&(n&&this._sb.push(n),Ve(this))},he.prototype.forceUpdate=function(t){this.__v&&(this.__e=!0,t&&this.__h.push(t),Ve(this))},he.prototype.render=L,X=[],Ge=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,Qe=function(t,n){return t.__v.__b-n.__v.__b},fe.__r=0,Ye=/(PointerCapture)$|Capture$/i,Ce=0,Me=We(!1),Pe=We(!0),qt=0;var ye,R,Ae,rt,$e=0,mt=[],$=M,at=$.__b,it=$.__r,lt=$.diffed,ct=$.__c,dt=$.unmount,ut=$.__;function ht(t,n){$.__h&&$.__h(R,t,$e||n),$e=0;var o=R.__H||(R.__H={__:[],__h:[]});return t>=o.__.length&&o.__.push({}),o.__[t]}function b(t){return $e=1,Qt(ft,t)}function Qt(t,n,o){var r=ht(ye++,2);if(r.t=t,!r.__c&&(r.__=[o?o(n):ft(void 0,n),function(u){var h=r.__N?r.__N[0]:r.__[0],d=r.t(h,u);h!==d&&(r.__N=[d,r.__[1]],r.__c.setState({}))}],r.__c=R,!R.__f)){var a=function(u,h,d){if(!r.__c.__H)return!0;var i=r.__c.__H.__.filter(function(f){return!!f.__c});if(i.every(function(f){return!f.__N}))return!s||s.call(this,u,h,d);var c=r.__c.props!==u;return i.forEach(function(f){if(f.__N){var m=f.__[0];f.__=f.__N,f.__N=void 0,m!==f.__[0]&&(c=!0)}}),s&&s.call(this,u,h,d)||c};R.__f=!0;var s=R.shouldComponentUpdate,l=R.componentWillUpdate;R.componentWillUpdate=function(u,h,d){if(this.__e){var i=s;s=void 0,a(u,h,d),s=i}l&&l.call(this,u,h,d)},R.shouldComponentUpdate=a}return r.__N||r.__}function O(t,n){var o=ht(ye++,3);!$.__s&&Jt(o.__H,n)&&(o.__=t,o.u=n,R.__H.__h.push(o))}function Yt(){for(var t;t=mt.shift();)if(t.__P&&t.__H)try{t.__H.__h.forEach(be),t.__H.__h.forEach(Oe),t.__H.__h=[]}catch(n){t.__H.__h=[],$.__e(n,t.__v)}}$.__b=function(t){R=null,at&&at(t)},$.__=function(t,n){t&&n.__k&&n.__k.__m&&(t.__m=n.__k.__m),ut&&ut(t,n)},$.__r=function(t){it&&it(t),ye=0;var n=(R=t.__c).__H;n&&(Ae===R?(n.__h=[],R.__h=[],n.__.forEach(function(o){o.__N&&(o.__=o.__N),o.u=o.__N=void 0})):(n.__h.forEach(be),n.__h.forEach(Oe),n.__h=[],ye=0)),Ae=R},$.diffed=function(t){lt&&lt(t);var n=t.__c;n&&n.__H&&(n.__H.__h.length&&(mt.push(n)!==1&&rt===$.requestAnimationFrame||((rt=$.requestAnimationFrame)||Xt)(Yt)),n.__H.__.forEach(function(o){o.u&&(o.__H=o.u),o.u=void 0})),Ae=R=null},$.__c=function(t,n){n.some(function(o){try{o.__h.forEach(be),o.__h=o.__h.filter(function(r){return!r.__||Oe(r)})}catch(r){n.some(function(a){a.__h&&(a.__h=[])}),n=[],$.__e(r,o.__v)}}),ct&&ct(t,n)},$.unmount=function(t){dt&&dt(t);var n,o=t.__c;o&&o.__H&&(o.__H.__.forEach(function(r){try{be(r)}catch(a){n=a}}),o.__H=void 0,n&&$.__e(n,o.__v))};var pt=typeof requestAnimationFrame=="function";function Xt(t){var n,o=function(){clearTimeout(r),pt&&cancelAnimationFrame(n),setTimeout(t)},r=setTimeout(o,35);pt&&(n=requestAnimationFrame(o))}function be(t){var n=R,o=t.__c;typeof o=="function"&&(t.__c=void 0,o()),R=n}function Oe(t){var n=R;t.__c=t.__(),R=n}function Jt(t,n){return!t||t.length!==n.length||n.some(function(o,r){return o!==t[r]})}function ft(t,n){return typeof n=="function"?n(t):n}function V(t,n=3){return t==null||!Number.isFinite(t)?"\\u2014":(t/1e9).toFixed(n)}function gt(t,n=3){let o=t/1e9;return`${o>0?"+":""}${o.toFixed(n)}`}function S(t,n=0,o=!1){if(t==null||!Number.isFinite(t))return"\\u2014";let r=t*100;return`${o&&r>0?"+":""}${r.toFixed(n)}%`}function W(t,n){return Number.isFinite(t)?n>0?Zt(t*n):`${t>=100?t.toFixed(0):t.toFixed(1)} SOL`:"\\u2014"}function Zt(t){if(!Number.isFinite(t))return"\\u2014";let n=Math.abs(t);return n>=1e9?`$${(t/1e9).toFixed(2)}B`:n>=1e6?`$${(t/1e6).toFixed(n>=1e7?1:2)}M`:n>=1e3?`$${(t/1e3).toFixed(n>=1e5?0:1)}k`:`$${t.toFixed(0)}`}function Q(t){return Number.isFinite(t)?t<60?`${Math.max(0,Math.round(t))}s`:t<3600?`${Math.round(t/60)}m`:t<86400?`${(t/3600).toFixed(1)}h`:`${(t/86400).toFixed(1)}d`:"\\u2014"}function _e(t,n=Date.now()){return t?`${Q((n-t)/1e3)} ago`:"\\u2014"}function J(t){return t?t.length>10?`${t.slice(0,4)}\\u2026${t.slice(-4)}`:t:"\\u2014"}function ne(t){return new Date(t).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}var vt=t=>t>=75?"b3":t>=60?"b2":"b1";var N={demo:!1,moreTabs:[]};var oe={authed:null,settings:null,account:null,rows:[],health:null,funnelHour:null,funnelDay:null,signals:[],connected:!1,solUsd:0,lastUpdate:0,skew:0,toast:"",nav:null},De=new Set;function He(){return oe}function z(t){oe={...oe,...t};for(let n of De)n()}function _(t){let[,n]=b(0);return O(()=>{let o=()=>n(r=>r+1);return De.add(o),()=>void De.delete(o)},[]),t(oe)}var Ne=null;function w(t){z({toast:t}),Ne&&clearTimeout(Ne),Ne=setTimeout(()=>z({toast:""}),3200)}function se(t,n){z({nav:{tab:t,sub:n,at:Date.now()}})}var en={async request(t,n){let o=await fetch(t,{method:n===void 0?"GET":"POST",credentials:"same-origin",headers:n===void 0?{accept:"application/json"}:{"content-type":"application/json","x-signal":"1"},body:n===void 0?void 0:JSON.stringify(n)});return{status:o.status,json:await o.json().catch(()=>({}))}},stream(t,n,o){let r=new EventSource("/api/stream");r.addEventListener("open",n),r.addEventListener("error",o);for(let a of["hello","radar","health","settings","signal","position"])r.addEventListener(a,s=>t(a,JSON.parse(s.data)));return()=>r.close()}},bt=en;async function E(t,n){let{status:o,json:r}=await bt.request(t,n);if(o===401)throw z({authed:!1}),new Error("login required");if(o>=400)throw new Error(r?.error??`HTTP ${o}`);return r}async function j(){try{let t=await E("/api/state");z({authed:!0,settings:t.settings,account:t.account,health:t.health,funnelHour:t.funnel.hour,funnelDay:t.funnel.day,signals:t.signals,solUsd:t.solUsd||oe.solUsd,skew:Date.now()-t.serverTime,lastUpdate:Date.now()})}catch{}}var Se=null;function xe(){Se?.(),Se=bt.stream((t,n)=>{switch(t){case"hello":z({settings:n.settings,account:n.account,rows:n.rows,connected:!0,lastUpdate:Date.now(),skew:Date.now()-n.serverTime});break;case"radar":z({rows:n.rows,account:n.account,lastUpdate:Date.now(),connected:!0});break;case"health":z({health:n});break;case"settings":z({settings:n});break;case"signal":z({signals:[n,...oe.signals.filter(o=>o.id!==n.id)].slice(0,200)});break;case"position":{let{position:o,what:r}=n;r==="fill"&&o.fills?.length===1&&w(`Bought $${o.symbol||"coin"} \\xB7 score ${Math.round(o.signalScore)}`),r==="close"&&w(`Sold $${o.symbol||"coin"} \\xB7 ${o.exitReason} \\xB7 ${(o.pnlPct??0).toFixed(1)}%`);break}}},()=>z({connected:!0}),()=>z({connected:!1}))}function yt(){Se?.(),Se=null}var tn=0,Fn=Array.isArray;function e(t,n,o,r,a,s){n||(n={});var l,u,h=n;if("ref"in h)for(u in h={},n)u=="ref"?l=n[u]:h[u]=n[u];var d={type:t,props:h,key:o,ref:l,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--tn,__i:-1,__u:0,__source:a,__self:s};if(typeof t=="function"&&(l=t.defaultProps))for(u in l)h[u]===void 0&&(h[u]=l[u]);return M.vnode&&M.vnode(d),d}function ke({value:t,small:n}){return e("div",{class:`score ${vt(t)}`,"aria-label":`score ${Math.round(t)}`,children:[Math.round(t),n&&e("small",{children:n})]})}function Z({id:t,checked:n,onChange:o,label:r,disabled:a}){return e("label",{class:"switch",title:r,children:[e("input",{id:t,type:"checkbox",checked:n,disabled:a,"aria-label":r,onChange:s=>o(s.target.checked)}),e("span",{})]})}function P({label:t,help:n,children:o,htmlFor:r}){return e("div",{class:"field",children:[e("div",{class:"row",children:[e("label",{for:r,style:"flex:1",children:t}),e("div",{class:"ctrl",children:o})]}),n&&e("div",{class:"help",children:n})]})}function F({id:t,value:n,onChange:o,step:r=1,min:a,max:s,suffix:l,disabled:u}){return e("span",{class:"row",style:"gap:6px",children:[e("input",{id:t,class:"inp",type:"number",inputMode:"decimal",value:n,step:r,min:a,max:s,disabled:u,onInput:h=>{let d=Number(h.target.value);Number.isFinite(d)&&o(d)}}),l&&e("span",{class:"muted",children:l})]})}function ie({k:t,v:n,s:o,tone:r}){return e("div",{class:"stat",children:[e("div",{class:"k",children:t}),e("div",{class:`v num ${r??""}`,children:n}),o!==void 0&&e("div",{class:"s",children:o})]})}function x({children:t,tone:n}){return e("span",{class:`tag ${n??""}`,children:t})}function _t({points:t,height:n=64}){if(t.length<2)return e("div",{class:"empty",style:"padding:12px",children:"Equity line appears after the first closed trade."});let o=600,r=n,a=t.map(v=>v.t),s=t.map(v=>v.v),l=Math.min(...a),u=Math.max(...a),h=Math.min(...s),d=Math.max(...s),i=(d-h)*.1||Math.abs(d)*.01||1,c=v=>(v-l)/Math.max(1,u-l)*(o-8)+4,f=v=>r-4-(v-(h-i))/(d+i-(h-i))*(r-8),m=t.map((v,y)=>`${y?"L":"M"}${c(v.t).toFixed(1)},${f(v.v).toFixed(1)}`).join(" "),p=t[t.length-1],T=p.v>=t[0].v?"var(--good)":"var(--bad)";return e("svg",{class:"spark",viewBox:`0 0 ${o} ${r}`,preserveAspectRatio:"none",role:"img","aria-label":"equity over time",children:[e("line",{x1:"0",x2:o,y1:f(t[0].v),y2:f(t[0].v),stroke:"var(--line2)","stroke-dasharray":"3 4","stroke-width":"1"}),e("path",{d:`${m} L${c(p.t)},${r} L${c(t[0].t)},${r} Z`,fill:T,opacity:"0.12"}),e("path",{d:m,fill:"none",stroke:T,"stroke-width":"2","vector-effect":"non-scaling-stroke"}),e("circle",{cx:c(p.t),cy:f(p.v),r:"4",fill:T})]})}function St({bins:t,threshold:n}){let o=Math.max(1,...t);return e("div",{children:[e("div",{class:"hist",role:"img","aria-label":"score distribution",children:t.map((r,a)=>e("i",{class:a*10+10>n?"hot":"",style:{height:`${Math.max(3,r/o*100)}%`},title:`${a*10}\\u2013${a*10+9}: ${r}`},a))}),e("div",{class:"row faint",style:"justify-content:space-between;font-size:11px;margin-top:4px",children:[e("span",{children:"0"}),e("span",{children:"50"}),e("span",{children:"100"})]})]})}function A({children:t}){return e("div",{class:"empty",children:t})}var xt={radar:e("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:[e("circle",{cx:"12",cy:"12",r:"9"}),e("circle",{cx:"12",cy:"12",r:"4.5"}),e("path",{d:"M12 12l6-6"})]}),trades:e("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:[e("path",{d:"M3 17l6-6 4 4 8-8"}),e("path",{d:"M14 7h7v7"})]}),bot:e("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:[e("rect",{x:"4",y:"7",width:"16",height:"12",rx:"3"}),e("path",{d:"M12 3v4M9 12h.01M15 12h.01M9 16h6"})]}),learn:e("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:e("path",{d:"M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6"})}),more:e("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:[e("circle",{cx:"5",cy:"12",r:"1.5"}),e("circle",{cx:"12",cy:"12",r:"1.5"}),e("circle",{cx:"19",cy:"12",r:"1.5"})]})};var kt={trailPct:0,takeInitials:!1,reentry:!1,tradeCurve:!0,tradeAmm:!0,scoreOnly:!0},wt=[{key:"plan",name:"Your plan",note:"Buy when a coin reaches 75 \\xB7 sell at 2\\xD7 or \\u221250% \\xB7 time limit 4 hours. Score only.",proof:"yours",settings:{...kt,minScore:75,tpPct:100,slPct:50,maxHoldMin:240}},{key:"sim-momentum",name:"Simulator finding: fast momentum",note:"Buy when a coin reaches 95 \\xB7 sell at +500% or \\u221220%, or after 10 minutes. It won in the simulator, which has more momentum than pump.fun \\u2014 paper-test it before trusting it.",proof:"unproven",settings:{...kt,minScore:95,tpPct:500,slPct:20,maxHoldMin:10}}];function Ie(t,n){for(let[o,r]of Object.entries(n))if(o==="filters"){for(let[a,s]of Object.entries(r))if(t.filters[a]!==s)return!1}else if(t[o]!==r)return!1;return!0}function we(t){let n=t.maxHoldMin>0?t.maxHoldMin>=120&&t.maxHoldMin%60===0?`${t.maxHoldMin/60} h`:`${t.maxHoldMin} min`:"no time limit";return`score \\u2265 ${t.minScore} \\xB7 +${t.tpPct}% / \\u2212${t.slPct}% \\xB7 ${n}`}function Tt(){let t=_(g=>g.settings),n=_(g=>g.funnelHour),o=_(g=>g.funnelDay),r=_(g=>g.health),a=_(g=>g.account),[s,l]=b(t),[u,h]=b(!1),[d,i]=b(!1),[c,f]=b(!1);if(O(()=>{u||l(t)},[t,u]),!s||!t)return null;let m=(g,B)=>{l({...s,[g]:B}),h(!0)},p=(g,B)=>{l({...s,filters:{...s.filters,[g]:B}}),h(!0)},k=async g=>{i(!0);try{let B=await E("/api/settings",g??s);l(B.settings),h(!1),w(g?"Updated":"Saved \\u2014 applies to new trades"),j()}catch(B){w(String(B.message))}finally{i(!1)}},T=!!r?.live&&!r.live.halted,v=o?.scored??0,y=o?.coinsAbove?.[Math.round(s.minScore)]??0,H=v>0?y/v:NaN,D=Math.max(1/6,Math.min(o?.hours??1,(r?.uptimeSec??3600)/3600)),I=v>0?y/D:NaN;return e("div",{children:[e("div",{class:`bigswitch ${t.enabled?"on":""}`,children:[e(Z,{id:"enabled",checked:t.enabled,label:"Auto-trading",onChange:g=>k({enabled:g})}),e("div",{style:"flex:1",children:[e("div",{style:"font-weight:760;font-size:16px",children:t.enabled?"Auto-trading is ON":"Auto-trading is paused"}),e("div",{class:"muted",style:"font-size:13px",children:t.enabled?`${we(t)}${t.scoreOnly?" \\xB7 score only":" \\xB7 with filters"} \\xB7 ${t.mode==="live"?"LIVE money":"paper"} \\xB7 ${N.demo?"demo: runs while this page is open (the real bot runs on a server 24/7)":"runs on the server even with this page closed"}`:"The radar keeps scoring; no new trades. Open positions are still managed."})]}),e(x,{tone:t.mode==="live"?"bad":"flare",children:t.mode==="live"?"LIVE":"PAPER"})]}),e(on,{settings:t,onApplied:()=>void j()}),e("div",{class:"grid two",style:"margin-top:12px",children:[e("div",{class:"card",children:[e("h2",{children:"Entry"}),e(P,{label:`Minimum score: ${s.minScore}`,htmlFor:"minScore",help:e(L,{children:[Number.isFinite(H)?e(L,{children:["Recently ",e("b",{children:I.toFixed(1)})," coins/hour reached this (",(H*100).toFixed(1),"% of scored coins) \\u2014 that is roughly how many chances to buy you get."]}):"Collecting data on how often coins reach each score\\u2026"," ","75 \\u2248 4\\xD7 the odds of an average coin; each +12.5 doubles the odds again."]}),children:e("span",{})}),e("input",{id:"minScore",type:"range",min:0,max:100,step:1,value:s.minScore,onInput:g=>m("minScore",Number(g.target.value)),style:"width:100%","aria-label":"minimum score"}),e("div",{class:"field",style:s.scoreOnly?"background:var(--flare-soft);border-radius:10px;padding:12px;margin:8px 0;border:0":"",children:[e("div",{class:"row",children:[e("label",{for:"scoreOnly",style:"flex:1;font-weight:700",children:"Score only"}),e(Z,{id:"scoreOnly",checked:s.scoreOnly,label:"Score only",onChange:g=>m("scoreOnly",g)})]}),e("div",{class:"help",children:"When on, the bot buys on the score alone and ignores every filter below. Your budget limits still apply (size, max open positions, daily loss, one entry per coin) \\u2014 they protect the wallet, they don\'t judge the coin."})]}),e(P,{label:"Take profit",htmlFor:"tp",help:"Net of all fees and slippage. 100 = sell at 2\\xD7.",children:e(F,{id:"tp",value:s.tpPct,onChange:g=>m("tpPct",g),min:1,suffix:"%"})}),e(P,{label:"Stop loss",htmlFor:"sl",help:"From your entry cost, fixed (not trailing). In a crash the fill can land below this \\u2014 the bot always sells.",children:e(F,{id:"sl",value:s.slPct,onChange:g=>m("slPct",g),min:1,max:99,suffix:"%"})}),e(P,{label:"Sell after",htmlFor:"hold",help:"Time limit for each trade: sells at market if neither the target nor the stop was hit by then. 0 = no limit.",children:e(F,{id:"hold",value:s.maxHoldMin,onChange:g=>m("maxHoldMin",g),min:0,suffix:"min"})}),e(P,{label:"Size per trade",htmlFor:"size",help:t.mode==="live"&&r?.live?`Server cap: ${r.live.maxPositionSol} SOL per live trade.`:"Fees included.",children:e(F,{id:"size",value:s.positionSol,onChange:g=>m("positionSol",g),step:.01,min:.001,suffix:"SOL"})}),e(P,{label:"Max open positions",htmlFor:"maxOpen",children:e(F,{id:"maxOpen",value:s.maxOpen,onChange:g=>m("maxOpen",g),min:1,max:50})}),e(P,{label:"Trade stage",help:"Bonding curve = before graduation (fast, cheap entry). Graduated = PumpSwap after migration.",children:e("div",{class:"chips",children:[e("button",{class:"chip","aria-pressed":s.tradeCurve,onClick:()=>m("tradeCurve",!s.tradeCurve),children:"Curve"}),e("button",{class:"chip","aria-pressed":s.tradeAmm,onClick:()=>m("tradeAmm",!s.tradeAmm),children:"Graduated"})]})}),e("div",{class:"row",style:"margin-top:12px;gap:8px",children:[e("button",{class:"btn primary",disabled:!u||d,onClick:()=>k(),children:d?"Saving\\u2026":u?"Save settings":"Saved"}),u&&e("button",{class:"btn ghost",onClick:()=>{l(t),h(!1)},children:"Discard"})]}),e("p",{class:"faint",style:"font-size:12px;margin:10px 0 0",children:"Open positions keep the exit settings they were bought with."})]}),e(nn,{funnel:n,threshold:t.minScore,scoreOnly:t.scoreOnly,enabled:t.enabled,open:a?.open.length??0,maxOpen:t.maxOpen})]}),e("div",{class:"card",style:"margin-top:12px",children:[e("h2",{children:["Filters ",s.scoreOnly&&e(x,{tone:"flare",children:"ignored \\u2014 score only is on"})]}),e("fieldset",{disabled:s.scoreOnly,style:"border:0;padding:0;margin:0;opacity:1",children:e("div",{style:s.scoreOnly?"opacity:.45":"",children:[e(P,{label:"Max dev holding",htmlFor:"fDev",children:e(F,{id:"fDev",value:s.filters.maxDevPct,onChange:g=>p("maxDevPct",g),suffix:"%"})}),e(P,{label:"Max top-10 holders",htmlFor:"fTop",children:e(F,{id:"fTop",value:s.filters.maxTop10Pct,onChange:g=>p("maxTop10Pct",g),suffix:"%"})}),e(P,{label:"Max launch bundle",htmlFor:"fBundle",help:"Supply bought by other wallets in the launch block.",children:e(F,{id:"fBundle",value:s.filters.maxBundlePct,onChange:g=>p("maxBundlePct",g),suffix:"%"})}),e(P,{label:"Min distinct buyers",htmlFor:"fBuyers",children:e(F,{id:"fBuyers",value:s.filters.minBuyers,onChange:g=>p("minBuyers",g)})}),e(P,{label:"Market cap window",help:"SOL, 0 = no limit",children:e("span",{class:"row",style:"gap:6px",children:[e(F,{id:"fMin",value:s.filters.minMcapSol,onChange:g=>p("minMcapSol",g)}),e("span",{class:"faint",children:"to"}),e(F,{id:"fMax",value:s.filters.maxMcapSol,onChange:g=>p("maxMcapSol",g)})]})}),e(P,{label:"Skip serial launchers",htmlFor:"fSerial",help:"Devs with more than this many launches in 24h (0 = off).",children:e(F,{id:"fSerial",value:s.filters.maxDevLaunches24h,onChange:g=>p("maxDevLaunches24h",g)})}),e(P,{label:"Skip if dev sold more than",htmlFor:"fDevSold",help:"100 = off",children:e(F,{id:"fDevSold",value:s.filters.maxDevSoldPct,onChange:g=>p("maxDevSoldPct",g),suffix:"%"})}),e(P,{label:"Require socials",htmlFor:"fSocial",children:e(Z,{id:"fSocial",checked:s.filters.requireSocials,label:"Require socials",onChange:g=>p("requireSocials",g)})})]})}),e("details",{class:"more",children:[e("summary",{children:"Advanced execution"}),e(P,{label:"Entry slippage",htmlFor:"slip",help:"How far the price may move before your buy lands. Too tight = missed entries on fast coins; the bot retries while the score holds.",children:e(F,{id:"slip",value:s.slippagePct,onChange:g=>m("slippagePct",g),suffix:"%"})}),e(P,{label:"Keep retrying a missed entry for",htmlFor:"retry",children:e(F,{id:"retry",value:s.retryWindowSec,onChange:g=>m("retryWindowSec",g),suffix:"s"})}),e(P,{label:"Score must hold for",htmlFor:"confirm",help:"Evaluations in a row at or above your score before buying \\u2014 about one per second while the coin trades. 5 skips one-off spikes and costs a few seconds; 1 buys on the first.",children:e(F,{id:"confirm",value:s.confirmTicks,onChange:g=>m("confirmTicks",g),min:1,max:20})}),e(P,{label:"Exit slippage (starts at)",htmlFor:"xslip",help:"Escalates automatically on retries \\u2014 exits always go through.",children:e(F,{id:"xslip",value:s.exitSlippagePct,onChange:g=>m("exitSlippagePct",g),suffix:"%"})}),e(P,{label:"Sell a coin that went quiet after",htmlFor:"stale",help:"No trades for this long frees the slot (0 = never).",children:e(F,{id:"stale",value:s.staleExitMin,onChange:g=>m("staleExitMin",g),suffix:"min"})}),e(P,{label:"Trailing stop after target",htmlFor:"trail",help:"When TP is reached, keep riding and sell if the value drops this much from its peak (0 = sell at TP).",children:e(F,{id:"trail",value:s.trailPct,onChange:g=>m("trailPct",g),suffix:"%"})}),e(P,{label:"Take initials at target",htmlFor:"initials",help:"At TP sell just enough to get your stake back; the rest rides with the trailing stop (40% if none set).",children:e(Z,{id:"initials",checked:s.takeInitials,label:"Take initials",onChange:g=>m("takeInitials",g)})}),e(P,{label:"Priority fee",htmlFor:"prio",children:e(F,{id:"prio",value:s.priorityFeeSol,onChange:g=>m("priorityFeeSol",g),step:1e-4,suffix:"SOL"})}),e(P,{label:"Daily loss limit",htmlFor:"dll",help:"Stops new entries for the rest of the UTC day (0 = off).",children:e(F,{id:"dll",value:s.maxDailyLossSol,onChange:g=>m("maxDailyLossSol",g),step:.05,suffix:"SOL"})}),e(P,{label:"Max trades per hour",htmlFor:"tph",children:e(F,{id:"tph",value:s.maxTradesPerHour,onChange:g=>m("maxTradesPerHour",g)})}),e(P,{label:"Buy the same coin again",htmlFor:"reentry",help:"Off: each coin gets one entry moment \\u2014 the first time it reaches your score. On: it can be bought again after dipping and coming back, which in simulation lost about 40% per trade.",children:e(Z,{id:"reentry",checked:s.reentry,label:"Re-entry",onChange:g=>m("reentry",g)})}),e(P,{label:"Auto-tune (paper only)",htmlFor:"autotune",help:"After each learning run, switch score/TP/SL to the combination with the best proven results (95% worst case must beat the current one). Never touches live settings.",children:e(Z,{id:"autotune",checked:s.autoTune,label:"Auto-tune",onChange:g=>m("autoTune",g)})}),e(P,{label:"Paper delay",htmlFor:"lat",help:"Simulated time from decision to landing on-chain. Honest paper results need a realistic delay.",children:e(F,{id:"lat",value:s.paperLatencyMs,onChange:g=>m("paperLatencyMs",g),step:100,suffix:"ms"})})]})]}),e("div",{class:"grid two",style:"margin-top:12px",children:[e("div",{class:"card",children:[e("h2",{children:"Mode"}),e("div",{class:"chips",children:[e("button",{class:"chip","aria-pressed":t.mode==="paper",onClick:()=>k({mode:"paper"}),children:"Paper"}),e("button",{class:"chip","aria-pressed":t.mode==="live",disabled:!T,onClick:()=>k({mode:"live"}),children:"Live"})]}),e("p",{class:"muted",style:"font-size:13px",children:T?`Live wallet ${r?.live?.address?.slice(0,4)}\\u2026${r?.live?.address?.slice(-4)} \\xB7 balance ${r?.live?.balanceSol?.toFixed(3)??"?"} SOL \\xB7 cap ${r?.live?.maxPositionSol} SOL/trade.`:r?.live?.halted?`Live trading halted: ${r.live.halted}.`:"Live is locked. It unlocks only when the server owner sets LIVE_TRADING and a dedicated wallet \\u2014 see Setup."}),r?.live?.halted&&e("button",{class:"btn sm",onClick:()=>E("/api/live/resume",{}).then(()=>w("Live resumed")),children:"Resume live"})]}),e("div",{class:"card",children:[e("h2",{children:"Emergency"}),c?e("div",{class:"row wrap",children:[e("b",{children:"Sell everything now?"}),e("button",{class:"btn danger",onClick:async()=>{await E("/api/kill",{on:!0,sellAll:!0}),f(!1),w("Kill switch ON \\u2014 selling"),j()},children:"Yes, sell all"}),e("button",{class:"btn",onClick:()=>f(!1),children:"Cancel"})]}):e("div",{class:"row wrap",children:[e("button",{class:"btn danger",onClick:()=>f(!0),children:"Kill switch"}),e("span",{class:"muted",style:"font-size:13px",children:"Stops all new entries and sells every open position."})]}),a?.killed&&e("button",{class:"btn sm",style:"margin-top:8px",onClick:()=>E("/api/kill",{on:!1}).then(()=>j()),children:"Turn kill switch off"})]})]})]})}function nn({funnel:t,threshold:n,scoreOnly:o,enabled:r,open:a,maxOpen:s}){if(!t)return e("div",{class:"card",children:"Loading\\u2026"});let l=r?t.scored===0?"No coins scored yet \\u2014 check that the data feeds are green (More \\u2192 Health).":t.maxScore<n?`No coin reached ${n} this hour (best was ${Math.round(t.maxScore)}). Lower the score to trade more often.`:t.signals===0?`Coins reached ${n}, but none crossed it since the bot was switched on or the threshold changed.`:a>=s?`All ${s} position slots are in use.`:t.entered>0?"Trading normally.":"Signals were blocked \\u2014 see the reasons below.":"Auto-trading is paused.";return e("div",{class:"card",children:[e("h2",{children:"Why no trade? \\xB7 last hour"}),e("p",{style:"margin:0 0 10px;font-weight:650",children:l}),e("div",{class:"stats",style:"grid-template-columns:repeat(4,1fr)",children:[e("div",{class:"stat",children:[e("div",{class:"k",children:"Coins scored"}),e("div",{class:"v num",children:t.scored})]}),e("div",{class:"stat",children:[e("div",{class:"k",children:["Reached ",n]}),e("div",{class:"v num",children:t.coinsAbove?.[Math.round(n)]??t.signals})]}),e("div",{class:"stat",children:[e("div",{class:"k",children:"Bought"}),e("div",{class:"v num good",children:t.entered})]}),e("div",{class:"stat",children:[e("div",{class:"k",children:"Missed"}),e("div",{class:"v num warn",children:t.failed})]})]}),e("div",{style:"margin:12px 0 4px",class:"faint",children:["Best score of each coin this hour (highest ",Math.round(t.maxScore),"):"]}),e(St,{bins:t.hist,threshold:n}),t.reasons.length>0&&e("div",{style:"margin-top:12px",children:[e("div",{class:"faint",style:"margin-bottom:6px",children:["Blocked because\\u2026 ",o&&e(x,{tone:"flare",children:"score only: filters skipped"})]}),e("table",{children:e("tbody",{children:t.reasons.slice(0,8).map(u=>e("tr",{children:[e("td",{children:u.text}),e("td",{class:"r num",children:u.n})]},u.reason))})})]})]})}function on({settings:t,onApplied:n}){let[o,r]=b([]),[a,s]=b(null),[l,u]=b(null);O(()=>{E("/api/edges").then(f=>r(f.report?.survivors?.slice(0,3)??[])).catch(()=>{})},[]);let h=[...wt,...o.map(f=>({key:`edge:${f.text}`,name:"Found in your data",note:`${f.text}. ${S(f.holdout.mean,1,!0)} per trade on ${f.holdout.n} trades the search never saw.`,proof:"data",settings:f.settings}))],d=t.mode==="live",i=async f=>{if(d&&a!==f.key){s(f.key);return}u(f.key);try{await E("/api/settings",f.settings),w(t.enabled?`Now trading: ${f.name}`:`Strategy set: ${f.name}. Switch Auto-trading on to start.`),s(null),n()}catch(m){w(String(m.message))}finally{u(null)}},c=!h.some(f=>Ie(t,f.settings));return e("div",{class:"card",style:"margin-top:12px",children:[e("h2",{children:"Strategy"}),e("p",{class:"faint",style:"margin:0 0 4px;font-size:12.5px",children:"One tap sets the whole rule \\u2014 entry score, which coins, take profit, stop loss and time limit. Fine-tune it below afterwards."}),c&&e("div",{class:"strat active",children:e("div",{style:"flex:1;min-width:0",children:[e("div",{class:"row wrap",style:"gap:6px",children:[e("b",{children:"Custom"}),e(x,{tone:"flare",children:"active"})]}),e("div",{class:"num",style:"font-size:13px",children:[we(t)," \\xB7 ",t.scoreOnly?"score only":"with filters"]})]})}),h.map(f=>{let m=Ie(t,f.settings);return e("div",{class:`strat ${m?"active":""}`,children:[e("div",{style:"flex:1;min-width:0",children:[e("div",{class:"row wrap",style:"gap:6px",children:[e("b",{children:f.name}),f.proof==="unproven"&&e(x,{tone:"warn",children:"unproven"}),f.proof==="data"&&e(x,{tone:"good",children:"held up on unseen data"}),m&&e(x,{tone:"flare",children:"active"})]}),e("div",{class:"num",style:"font-size:13px",children:we(f.settings)}),e("div",{class:"faint",style:"font-size:12.5px",children:f.note})]}),!m&&e("button",{class:`btn sm ${a===f.key?"danger":"primary"}`,disabled:!!l,onClick:()=>i(f),children:l===f.key?"\\u2026":a===f.key?"Tap again \\u2014 real money":"Use this"})]},f.key)}),d&&e("p",{class:"faint note",children:"You are live: switching asks for a second tap. Open positions keep the rule they were bought with."})]})}var le={initialVirtualTok:1073e12,initialVirtualSol:3e10,initialRealTok:7931e11,supply:1e15},Wn=(()=>{let t=le.initialVirtualSol*le.initialVirtualTok,n=le.initialVirtualTok-le.initialRealTok;return t/n-le.initialVirtualSol})();var ce=[25,50,75,100,150,200,300,500],de=[10,20,30,40,50,70],ee=ce.flatMap(t=>de.map(n=>({tp:t,sl:n})));var Be=[50,55,60,65,70,75,80,85,90,95];var lo=1+ee.length,co=Float64Array.from(ee,t=>1+t.tp/100),uo=Float64Array.from(ee,t=>1-t.sl/100);var ze=[0,10,30,60],yo=ee.length*ze.length,K=t=>t.f,Pt=[{key:"any",label:"any coin",test:()=>!0},{key:"curve",label:"still on the bonding curve",test:t=>t.stage==="curve",stage:"curve"},{key:"amm",label:"already graduated",test:t=>t.stage==="amm",stage:"amm"},...[40,80,150].map(t=>({key:`mcap<=${t}`,label:`market cap \\u2264 ${t} SOL`,test:n=>K(n).mcap<=t,filters:{maxMcapSol:t}})),...[80,150,300].map(t=>({key:`mcap>=${t}`,label:`market cap \\u2265 ${t} SOL`,test:n=>K(n).mcap>=t,filters:{minMcapSol:t}})),...[1,3,10].map(t=>({key:`age<=${t}m`,label:`younger than ${t} min`,test:n=>K(n).age<=t*60,filters:{maxAgeMin:t}})),...[3,10].map(t=>({key:`age>=${t}m`,label:`older than ${t} min`,test:n=>K(n).age>=t*60,filters:{minAgeSec:t*60}})),{key:"bundle<=10",label:"\\u2264 10% bundled at launch",test:t=>K(t).bundle*100<=10,filters:{maxBundlePct:10}},{key:"top10<=30",label:"top 10 holders own \\u2264 30%",test:t=>K(t).top10*100<=30,filters:{maxTop10Pct:30}},...[30,100].map(t=>({key:`buyers>=${t}`,label:`${t}+ buyers`,test:n=>K(n).buyers>=t,filters:{minBuyers:t}})),{key:"socials",label:"has socials",test:t=>K(t).socials>0,filters:{requireSocials:!0}},{key:"dev<=5",label:"dev holds \\u2264 5%",test:t=>K(t).devShare*100<=5,filters:{maxDevPct:5}},{key:"devheld",label:"dev hasn\'t sold",test:t=>K(t).devSold<=0,filters:{maxDevSoldPct:0}},{key:"onelaunch",label:"dev\'s only launch today",test:t=>K(t).launches24h<=1,filters:{maxDevLaunches24h:1}}];var _o={horizonMs:6*36e5,minHours:24,minSamples:1e3,minDiscovery:80,minHoldout:40,candidates:20,minWins:10,placeboRuns:3,seed:7};function Lt(){let t=_(i=>i.settings),n=_(i=>i.health),[o,r]=b(null),[a,s]=b(""),[l,u]=b(!1),h=()=>E("/api/learn?days=14").then(r).catch(i=>s(String(i.message??i)));if(O(()=>{h();let i=setInterval(h,6e4);return()=>clearInterval(i)},[t?.minScore,t?.tpPct,t?.slPct]),a)return e(A,{children:a});if(!o)return e(A,{children:"Loading evidence\\u2026"});let d=Math.max(.05,...o.grid.filter(i=>i.n>0).map(i=>Math.abs(i.avgRet)));return e("div",{children:[e("div",{class:"section-title",children:[e("h2",{children:"Does the score make money?"}),e("span",{class:"muted num",children:[o.samples.toLocaleString()," resolved outcomes \\xB7 ",o.spanHours.toFixed(1)," h of data"]})]}),e("div",{class:`card ${o.gate.pass,""}`,style:`border-color:${o.gate.pass?"var(--good)":"var(--line)"}`,children:[e("div",{class:"row",style:"align-items:flex-start",children:[e("div",{style:"flex:1",children:[e("div",{class:"faint",style:"font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:700",children:["Go-live check \\xB7 score \\u2265 ",o.settings.minScore,", TP ",o.settings.tpPct,"%, SL ",o.settings.slPct,"%"]}),e("div",{style:"font-size:19px;font-weight:780;margin:4px 0",children:o.gate.verdict}),e("div",{class:"muted",children:o.gate.detail})]}),e(x,{tone:o.gate.pass?"good":"warn",children:o.gate.pass?"evidence \\u2713":"paper first"})]}),e("p",{class:"faint",style:"font-size:12.5px;margin:10px 0 0",children:["Every eligible coin is followed from fixed checkpoints and at every signal, as if bought with your size and delay, until the target or the stop is hit. Break-even win rate at these settings \\u2248 ",e("b",{children:S(o.breakEven)})," (fees, delay and stop slippage included)."]})]}),e(rn,{mode:t?.mode??"paper"}),o.suggestion&&e("div",{class:"card",style:"margin-top:12px;border-color:var(--flare)",children:[e("h2",{children:"Better settings found"}),e("p",{style:"margin:0 0 10px",children:[e("b",{children:["Score \\u2265 ",o.suggestion.minScore," \\xB7 TP ",o.suggestion.tpPct,"% \\xB7 SL ",o.suggestion.slPct,"%"]})," ","\\u2014 ",o.suggestion.why,"."]}),e("div",{class:"row wrap",children:[e("button",{class:"btn primary",onClick:async()=>{try{await E("/api/settings",{minScore:o.suggestion.minScore,tpPct:o.suggestion.tpPct,slPct:o.suggestion.slPct}),w("Applied \\u2014 new trades use these settings"),h()}catch(i){w(String(i.message))}},children:"Apply"}),e("span",{class:"faint",style:"font-size:12.5px",children:"Past results can stop working. Auto-tune can do this for you in paper mode (Bot \\u2192 Advanced)."})]})]}),e("div",{class:"grid two",style:"margin-top:12px",children:[e("div",{class:"card",children:[e("h2",{children:"Score buckets \\u2192 outcome"}),o.checkpoints===0?e(A,{children:"Outcomes resolve as coins hit their targets or stops \\u2014 first rows appear within minutes, solid numbers take a few days."}):e("div",{class:"tablewrap",children:e("table",{children:[e("thead",{children:e("tr",{children:[e("th",{children:"Score"}),e("th",{class:"r",children:"n"}),e("th",{class:"r",children:"Profitable"}),e("th",{class:"r",children:"Avg result"}),e("th",{class:"r",children:"95% range"})]})}),e("tbody",{children:[...o.buckets].reverse().map(i=>e("tr",{style:i.lo>=(t?.minScore??75)-9&&i.lo<=90&&i.lo+10>(t?.minScore??75)?"background:var(--flare-soft)":"",children:[e("td",{class:"num",children:[i.lo,"\\u2013",i.hi]}),e("td",{class:"r num",children:i.n}),e("td",{class:"r num",children:i.n?S(i.winRate):"\\u2014"}),e("td",{class:`r num ${i.avgRet>0?"good":i.avgRet<0?"bad":""}`,children:i.n?S(i.avgRet,1,!0):"\\u2014"}),e("td",{class:"r num faint",children:i.n>1?`${S(i.retLo,0,!0)} \\u2026 ${S(i.retHi,0,!0)}`:"\\u2014"})]},i.lo))})]})})]}),e("div",{class:"card",children:[e("h2",{children:"Pick a threshold"}),e("p",{class:"faint",style:"margin:0 0 8px;font-size:12.5px",children:o.thresholdSource==="entries"?"What happened after coins first reached each score \\u2014 the moment the bot buys \\u2014 with your TP/SL, delay and costs.":"For now: snapshots of coins above each score. Buying the moment a coin reaches a score usually does worse; this switches to real entry outcomes after 200 of them."}),e("div",{class:"tablewrap",children:e("table",{children:[e("thead",{children:e("tr",{children:[e("th",{children:"Score \\u2265"}),e("th",{class:"r",children:"Coins/hour"}),e("th",{class:"r",children:"Profitable"}),e("th",{class:"r",children:"Avg result"})]})}),e("tbody",{children:o.thresholds.map(i=>e("tr",{style:i.min===t?.minScore?"background:var(--flare-soft)":"",children:[e("td",{class:"num",children:i.min}),e("td",{class:"r num",children:Number.isFinite(i.tokensPerHour)?i.tokensPerHour.toFixed(1):"\\u2014"}),e("td",{class:"r num",children:i.n?S(i.winRate):"\\u2014"}),e("td",{class:`r num ${i.avgRet>0?"good":i.avgRet<0?"bad":""}`,children:i.n?S(i.avgRet,1,!0):"\\u2014"})]},i.min))})]})})]})]}),e("div",{class:"card",style:"margin-top:12px",children:[e("h2",{children:["Take profit \\xD7 stop loss \\xB7 coins scoring \\u2265 ",o.settings.minScore]}),e("p",{class:"faint",style:"margin:0 0 8px;font-size:12.5px",children:["Average result per trade for each exit combination, delay and costs included, from"," ",o.gridSource==="signals"?"your own signals":o.gridSource==="entries"?"coins at the moment they first reached your score":"snapshots of coins above your score (until entry data builds up)",". Darker green = better; cells with fewer than 30 outcomes are faded."]}),e("div",{class:"tablewrap",children:e("table",{class:"heat",children:[e("thead",{children:e("tr",{children:[e("th",{children:"TP \\\\ SL"}),[...new Set(o.grid.map(i=>i.sl))].map(i=>e("th",{style:"text-align:center",children:["\\u2212",i,"%"]},i))]})}),e("tbody",{children:[...new Set(o.grid.map(i=>i.tp))].map(i=>e("tr",{children:[e("th",{children:["+",i,"%"]}),o.grid.filter(c=>c.tp===i).map(c=>{let f=Number.isFinite(c.avgRet)?Math.min(1,Math.abs(c.avgRet)/d):0,m=c.avgRet>=0?`color-mix(in srgb,var(--good) ${Math.round(f*45)}%,transparent)`:`color-mix(in srgb,var(--bad) ${Math.round(f*45)}%,transparent)`,p=c.tp===t?.tpPct&&c.sl===t?.slPct;return e("td",{style:{background:c.n?m:"transparent",opacity:c.n<30?.45:1,outline:p?"2px solid var(--flare)":"none"},title:`n=${c.n}, 95% ${S(c.retLo,1)} \\u2026 ${S(c.retHi,1)}`,children:c.n?S(c.avgRet,1,!0):"\\u2014"},c.sl)})]},i))})]})}),o.best&&e("p",{style:"margin:10px 0 0",children:["Most robust so far: ",e("b",{children:["TP ",o.best.tp,"% / SL ",o.best.sl,"%"]})," \\u2014 average ",S(o.best.avgRet,1,!0),", worst-case (95%) ",S(o.best.retLo,1,!0)," over ",o.best.n," outcomes."]})]}),e("div",{class:"grid two",style:"margin-top:12px",children:[e("div",{class:"card",children:[e("h2",{children:"Your paper results"}),e("dl",{class:"kv",children:[e("dt",{children:"Closed trades"}),e("dd",{children:o.paper.trades}),e("dt",{children:"Win rate"}),e("dd",{children:S(o.paper.winRate)}),e("dt",{children:"Profit"}),e("dd",{class:o.paper.pnlSol>=0?"good":"bad",children:[o.paper.pnlSol.toFixed(3)," SOL"]}),e("dt",{children:"Average trade"}),e("dd",{children:Number.isFinite(o.paper.avgPct)?`${o.paper.avgPct.toFixed(1)}%`:"\\u2014"}),e("dt",{children:"Profit factor"}),e("dd",{children:Number.isFinite(o.paper.profitFactor)?o.paper.profitFactor.toFixed(2):"\\u2014"}),e("dt",{children:"Worst drawdown"}),e("dd",{children:[o.paper.maxDrawdownSol.toFixed(3)," SOL"]})]})]}),e("div",{class:"card",children:[e("h2",{children:"Scoring model"}),e("dl",{class:"kv",children:[e("dt",{children:"Version"}),e("dd",{children:o.model.version}),e("dt",{children:"Source"}),e("dd",{children:o.model.source==="trained"?"trained on this server\'s data":"prior (market mechanics), self-scaled"}),o.model.training&&e(L,{children:[e("dt",{children:"Validation AUC"}),e("dd",{children:[o.model.training.valAuc?.toFixed(3)," (was ",o.model.training.priorValAuc?.toFixed(3),")"]}),e("dt",{children:"Trained on"}),e("dd",{children:[o.model.training.rows.toLocaleString()," outcomes"]})]}),e("dt",{children:"Last training"}),e("dd",{children:n?.learner?.lastRun?new Date(n.learner.lastRun).toLocaleString():"not yet"})]}),(n?.learner?.reports?.length??0)>0&&e("ul",{class:"muted",style:"font-size:12.5px;padding-left:18px",children:n.learner.reports.map(i=>e("li",{children:[i.stage,": ",i.reason]},i.stage))}),e("button",{class:"btn sm",disabled:l,onClick:async()=>{u(!0);try{let i=await E("/api/learn/run",{});w(i.reports.some(c=>c.adopted)?"New model adopted":"Current model kept"),h()}catch(i){w(String(i.message))}finally{u(!1)}},children:l?"Training\\u2026":"Retrain now"}),e("p",{class:"faint",style:"font-size:12px;margin-bottom:0",children:"The model retrains every few hours on outcomes recorded here and is swapped only when it beats the current one on newer data it did not train on."})]})]})]})}var Et=t=>t>=48?`${(t/24).toFixed(1)} days`:`${t.toFixed(0)} h`;function rn({mode:t}){let[n,o]=b(null),[r,a]=b(!1);O(()=>{E("/api/edges").then(d=>o(d.report)).catch(()=>{})},[]);let s=async()=>{a(!0);try{o((await E("/api/edges/run",{})).report)}catch(d){w(String(d.message))}finally{a(!1)}},[l,u]=b(null),h=async d=>{if(t==="live"&&l!==d.text){u(d.text);return}try{await E("/api/settings",d.settings),u(null),w("Now trading this rule \\u2014 score, exits, time limit and filters were replaced")}catch(i){w(String(i.message))}};return e("div",{class:"card",style:"margin-top:12px",children:[e("div",{class:"row",style:"align-items:flex-start",children:[e("div",{style:"flex:1",children:[e("h2",{style:"margin-bottom:4px",children:"Edge finder"}),e("div",{class:"muted",style:"font-size:13px",children:["Looks for profitable rules on its own: ",Be.length," score levels \\xD7 ",Pt.length," coin conditions \\xD7 ",ee.length*ze.length," exits (take profit ",ce[0],"\\u2013",ce[ce.length-1],"%, stop ",de[0],"\\u2013",de[de.length-1],"%, optional time limit). The best are re-checked on newer data the search never saw."]})]}),e("button",{class:"btn sm",disabled:r||n?.running,onClick:s,children:r||n?.running?"Searching\\u2026":"Search now"})]}),!n&&e("p",{class:"faint note",children:"Runs after every learning cycle, every few hours. Needs about a day of recorded market first."}),n?.status==="not_enough_data"&&e("p",{class:"faint note",children:n.note}),n?.status==="ok"&&e(L,{children:[e("p",{class:"edge-meta",children:["Scored ",e("b",{class:"num",children:n.tested.toLocaleString("en-US")})," rules on the first ",Et(n.discoveryHours),", re-checked the best ",n.candidates," on the last"," ",Et(n.holdoutHours),": ",e("b",{children:[n.survivors.length," held up"]}),\'. On shuffled data, where no rule can work, the same search "found" \',n.placebo.avgSurvivors.toFixed(1)," per run \\u2014 that is its rate of fooling itself."]}),n.survivors.slice(0,5).map(d=>e(Ct,{s:d,confirming:l===d.text,apply:h},d.text)),n.survivors.length>5&&e("details",{class:"more",children:[e("summary",{children:[n.survivors.length-5," more variations"]}),n.survivors.slice(5).map(d=>e(Ct,{s:d,confirming:l===d.text,apply:h},d.text))]}),n.survivors.length>0&&e("p",{class:"faint note",children:"Coins/day counts every coin that qualified; your size, open-position and hourly limits decide how many the bot actually takes."}),!n.survivors.length&&e("p",{class:"note",children:n.note}),n.failed.length>0&&e("details",{class:"more",children:[e("summary",{children:["Looked good, then failed on newer data (",n.failed.length,")"]}),n.failed.map(d=>e("div",{class:"edge",children:[e("div",{children:d.text}),e("div",{class:"faint num",style:"font-size:12.5px",children:[S(d.discovery.mean,1,!0)," in the search data \\u2192 ",S(d.holdout.mean,1,!0)," on the newest data (",d.holdout.n," trades)"]})]},d.text))]})]})]})}function Ct({s:t,confirming:n,apply:o}){return e("div",{class:"edge",children:[e("div",{class:"edge-rule",children:t.text}),e("div",{class:"num",style:"font-size:13px",children:[e("b",{class:t.holdout.mean>0?"good":"bad",children:S(t.holdout.mean,1,!0)})," per trade on the newest data \\xB7 worst case ",S(t.holdout.lo,1,!0)," \\xB7 ",t.holdout.n," ","trades \\xB7 ",S(t.holdout.winRate)," winners \\xB7 ~",t.tradesPerDay.toFixed(0)," coins/day"]}),e("div",{class:"faint num",style:"font-size:12.5px",children:["In the search data ",S(t.discovery.mean,1,!0)," \\xB7 every coin reaching ",t.level,", same exit: ",S(t.baseline,1,!0)]}),e("button",{class:`btn sm ${n?"danger":"primary"}`,style:"justify-self:start;margin-top:4px",onClick:()=>o(t),children:n?"Tap again \\u2014 real money":"Use this rule"})]})}var Te={bot_off:"Auto-trading is paused",kill_switch:"Kill switch is on",stage_off:"This stage is turned off in settings",non_sol_quote:"Coin is not paired with SOL",already_traded:"Already traded this coin (re-entry off)",max_open:"Max open positions reached",pending:"An order for this coin is already in flight",daily_loss_limit:"Daily loss limit reached",rate_limit:"Max trades per hour reached",feed_down:"Live data feed is down \\u2014 not trading blind",warming_up:"Learning this market\'s score scale (first minutes after install)",insufficient_balance:"Not enough SOL in the wallet",slippage:"Price moved more than your slippage before the buy landed",migrating:"Coin is migrating to PumpSwap (not tradable for a moment)",no_price:"No tradable price yet",no_liquidity:"Not enough liquidity",size_too_small:"Position size too small after fees",live_error:"Live order error",live_disabled:"Live trading is not enabled on the server","filter:mcap_min":"Market cap below your minimum","filter:mcap_max":"Market cap above your maximum","filter:dev":"Dev holds more than your limit","filter:top10":"Top 10 holders above your limit","filter:bundle":"Launch bundle above your limit","filter:buyers":"Fewer buyers than your minimum","filter:age_min":"Coin younger than your minimum age","filter:age_max":"Coin older than your maximum age","filter:socials":"No socials (you require them)","filter:serial_dev":"Dev launched too many coins today","filter:dev_sold":"Dev already sold more than your limit"};var an=20,ln=1e6/30;function cn(t,n){try{navigator.clipboard.writeText(t).then(()=>w(`${n} copied`),()=>w("Select the text and copy it"))}catch{w("Select the text and copy it")}}function ue({n:t,title:n,done:o,children:r}){return e("div",{class:`card step ${o?"done":""}`,children:[e("div",{class:"row",style:"gap:10px;margin-bottom:8px",children:[e("span",{class:"stepno",children:o?"\\u2713":t}),e("b",{style:"flex:1;font-size:15px",children:n}),o&&e(x,{tone:"good",children:"done"})]}),r]})}function Ft(){let t=_(C=>C.settings),[n,o]=b(null),[r,a]=b(!1),[s,l]=b(""),[u,h]=b(""),[d,i]=b(""),[c,f]=b(""),[m,p]=b("0.05"),[k,T]=b("0.25"),[v,y]=b(""),H=()=>E("/api/setup").then(C=>{o(C),a(!1)}).catch(()=>{});if(O(()=>{if(N.demo)return;H();let C=setInterval(H,4e3);return()=>clearInterval(C)},[]),N.demo)return e("div",{class:"card",children:[e("h2",{children:"Setup"}),e("p",{style:"margin-top:0",children:"On your own bot this page sets everything up with buttons \\u2014 no files to edit: the market-data key, Telegram alerts, a link for your phone, and going live with a wallet when you decide to."}),e("button",{class:"btn primary",onClick:()=>se("more","deploy"),children:"How to install the real bot"})]});if(!n)return e("div",{class:"empty",children:"Loading\\u2026"});let D=async(C,Y,re,U)=>{l(C);try{let q=await E(Y,re);U(q),q.restarting?a(!0):q.note&&w(q.note),H()}catch(q){w(String(q.message))}finally{l("")}},I=n.rpc.feed,g=!n.rpc.isPublic&&I?.status==="open",B=I?.mbPerDay?I.mbPerDay*an:null;return e("div",{class:"grid setup",children:[r&&e("div",{class:"banner sim",style:"margin:0;width:100%",children:"Restarting the bot to apply it \\u2014 this page reconnects by itself in a few seconds."}),e(ue,{n:1,title:"Market data (required)",done:g,children:[e("p",{class:"muted",style:"margin-top:0",children:["The bot needs a live feed of every pump.fun trade. A free Helius key gives it one: sign up at"," ",e("a",{href:"https://dashboard.helius.dev",target:"_blank",rel:"noopener",children:"dashboard.helius.dev"})," ","(Google login works), open ",e("b",{children:"API Keys"}),", copy the key and paste it here."]}),e("div",{class:"row wrap",style:"gap:8px",children:[e("input",{class:"inp wide",type:"password",autoComplete:"off",placeholder:"Helius API key",value:u,onInput:C=>h(C.target.value)}),e("button",{class:"btn primary",disabled:!u||!!s,onClick:()=>D("rpc","/api/setup/rpc",{key:u},()=>h("")),children:s==="rpc"?"Testing\\u2026":"Save and connect"})]}),e("p",{class:"faint note",children:[n.rpc.isPublic?"Now: the free public Solana endpoint \\u2014 slow and often cut off, so the bot sees few trades.":`Now: ${n.rpc.host} \\xB7 ${I?`${I.status}, ${I.msgs.toLocaleString("en-US")} messages`:"not connected"}`,B!==null&&!n.rpc.isPublic&&e(L,{children:[" ","\\xB7 about ",I.mbPerDay.toFixed(0)," MB/day \\u2248 ",Math.round(B).toLocaleString("en-US")," Helius credits/day",B>ln?" \\u2014 more than the free plan\'s ~33,000/day: expect Helius to ask for a paid plan before the month ends.":" \\u2014 within the free plan."]})]})]}),e(ue,{n:2,title:"Telegram alerts (optional)",done:n.telegram.linked,children:[n.telegram.linked?e("p",{class:"muted",style:"margin:0",children:"Linked. You get a message for every buy and sell, and can send /status, /pause, /resume, /score 75, /tp 100, /sl 50, /hold 10, /kill."}):n.telegram.code?e("p",{style:"margin:0",children:["Now open your new bot in Telegram and send it this code: ",e("b",{class:"num linkcode",children:n.telegram.code}),e("span",{class:"faint",children:" \\u2014 this page turns green when it arrives."})]}):e(L,{children:[e("ol",{class:"steps",style:"margin:0 0 8px",children:[e("li",{children:["In Telegram, open ",e("b",{children:"@BotFather"})," and send ",e("code",{children:"/newbot"}),"."]}),e("li",{children:\'Pick any name, then a username ending in "bot".\'}),e("li",{children:"Copy the token it gives you (looks like 123456789:AAH\\u2026) and paste it here."})]}),e("div",{class:"row wrap",style:"gap:8px",children:[e("input",{class:"inp wide",type:"password",autoComplete:"off",placeholder:"Bot token from @BotFather",value:d,onInput:C=>i(C.target.value)}),e("button",{class:"btn primary",disabled:!d||!!s,onClick:()=>D("tg","/api/setup/telegram",{token:d},()=>i("")),children:s==="tg"?"Checking\\u2026":"Connect"})]})]}),n.telegram.tokenSet&&e("button",{class:"btn sm ghost",style:"margin-top:6px",onClick:()=>D("tgoff","/api/setup/telegram-off",{},()=>w("Telegram disconnected")),children:"Disconnect Telegram"})]}),e(ue,{n:3,title:"Paper trading",done:!!t?.enabled&&t.mode==="paper",children:[e("p",{class:"muted",style:"margin:0 0 8px",children:["Fake money on the real market. Bot tab \\u2192 pick a ",e("b",{children:"Strategy"})," \\u2192 switch ",e("b",{children:"Auto-trading"})," on. Leave it running for days; the Learn tab tells you when the evidence is strong enough to go live."]}),e("button",{class:"btn",onClick:()=>se("bot"),children:"Open the Bot tab"})]}),e(ue,{n:4,title:"Your phone at home",done:!1,children:n.phoneUrl?e(L,{children:[e("p",{class:"muted",style:"margin:0 0 6px",children:"On the same Wi-Fi, open this link on your phone and add it to your home screen. Away from home, use Telegram."}),e("div",{class:"copyline",children:[e("code",{children:n.phoneUrl}),e("button",{class:"btn sm",onClick:()=>cn(n.phoneUrl,"Link"),children:"Copy"})]})]}):e("p",{class:"muted",style:"margin:0",children:"No home network found on this computer."})}),e(ue,{n:5,title:"Go live with real money \\u2014 only when ready",done:n.live.enabled&&n.live.ready,children:[n.live.enabled?e(L,{children:[e("p",{style:"margin:0 0 6px",children:["Live trading is allowed with wallet"," ",e("code",{children:[n.live.address?.slice(0,4),"\\u2026",n.live.address?.slice(-4)]})," ","\\xB7 max ",n.live.maxPositionSol," SOL per trade \\xB7 stops for the day after losing ",n.live.maxDailyLossSol," SOL."," ",n.live.ready?"Switch Bot tab \\u2192 Mode \\u2192 Live to start.":"The wallet is not ready yet (check More \\u2192 Health)."]}),e("div",{class:"row wrap",style:"gap:8px",children:[e("button",{class:"btn",onClick:()=>se("bot"),children:"Open the Bot tab"}),e("button",{class:"btn danger",disabled:!!s,onClick:()=>D("off","/api/setup/live-off",{},()=>w("Live trading off \\u2014 back to paper")),children:"Turn live off"})]})]}):n.privateChannel?e(L,{children:[e("ol",{class:"steps",style:"margin:0 0 10px",children:[e("li",{children:"In Phantom, create a new account used only by the bot, and send it the SOL you can afford to lose."}),e("li",{children:"Phantom \\u2192 Settings \\u2192 Manage accounts \\u2192 that account \\u2192 Show private key. Copy it."}),e("li",{children:"Paste it below. It stays on this computer and is never shown again."})]}),e("div",{class:"grid",style:"gap:8px",children:[e("input",{class:"inp wide",type:"password",autoComplete:"off",placeholder:n.live.walletSet?"Wallet saved \\u2014 paste only to replace it":"Bot wallet private key",value:c,onInput:C=>f(C.target.value)}),e("label",{class:"row",style:"gap:8px",children:[e("span",{style:"flex:1",children:"Max SOL per trade"}),e("input",{class:"inp",inputMode:"decimal",value:m,onInput:C=>p(C.target.value)})]}),e("label",{class:"row",style:"gap:8px",children:[e("span",{style:"flex:1",children:"Stop for the day after losing (SOL)"}),e("input",{class:"inp",inputMode:"decimal",value:k,onInput:C=>T(C.target.value)})]}),e("input",{class:"inp wide",autoComplete:"off",placeholder:\'Type "I understand the risk"\',value:v,onInput:C=>y(C.target.value)}),e("button",{class:"btn danger",disabled:!c&&!n.live.walletSet||!v||!!s,onClick:()=>D("live","/api/setup/live",{walletKey:c,maxPositionSol:Number(m),maxDailyLossSol:Number(k),confirm:v},C=>{f(""),y(""),w(`Live allowed for wallet ${String(C.address).slice(0,4)}\\u2026${String(C.address).slice(-4)}`)}),children:"Allow live trading"})]}),e("p",{class:"faint note",children:"After the restart, switch Bot tab \\u2192 Mode \\u2192 Live. The limits above cannot be raised from the Bot tab."})]}):e("p",{class:"muted",style:"margin:0",children:"For safety, a wallet can only be added on the computer running the bot \\u2014 open http://localhost:8787 there."}),n.live.walletSet&&n.privateChannel&&e("button",{class:"btn sm ghost",style:"margin-top:6px",onClick:()=>D("rm","/api/setup/wallet-remove",{},()=>w("Wallet removed from this bot")),children:"Remove the wallet from this bot"})]}),!n.supervised&&e("p",{class:"faint note",children:"This bot was started without its starter script, so after saving you will need to close it and start it again. Use start-windows.bat (or start-mac.command) so this happens by itself."})]})}var dn=[["signals","Signals log"],["narratives","Narratives"],["wallets","Smart wallets"],["health","Health"],["setup","Setup"]];function Rt({open:t}){let n=_(s=>s.nav),[o,r]=b(n?.tab==="more"&&n.sub?n.sub:N.moreTabs[0]?.key??"signals");O(()=>{n?.tab==="more"&&n.sub&&r(n.sub)},[n?.at]);let a=N.moreTabs.find(s=>s.key===o);return e("div",{children:[e("div",{class:"chips",style:"margin:14px 0",children:[...N.moreTabs.map(s=>[s.key,s.label]),...dn].map(([s,l])=>e("button",{class:"chip","aria-pressed":o===s,onClick:()=>r(s),children:l},s))}),a&&a.render(),o==="signals"&&e(un,{open:t}),o==="narratives"&&e(pn,{open:t}),o==="wallets"&&e(mn,{}),o==="health"&&e(hn,{}),o==="setup"&&e(L,{children:[e(Ft,{}),e(fn,{})]})]})}function un({open:t}){let n=_(r=>r.signals),o=_(r=>r.solUsd);return n.length?e("div",{class:"card flat",style:"padding:4px 8px",children:e("div",{class:"tablewrap",children:e("table",{children:[e("thead",{children:e("tr",{children:[e("th",{children:"Time"}),e("th",{children:"Coin"}),e("th",{class:"r",children:"Score"}),e("th",{class:"r",children:"Mcap"}),e("th",{children:"Decision"})]})}),e("tbody",{children:n.map(r=>e("tr",{style:"cursor:pointer",onClick:()=>t(r.mint),children:[e("td",{class:"faint num",children:ne(r.ts)}),e("td",{children:e("b",{children:["$",r.symbol||"?"]})}),e("td",{class:"r num",children:Math.round(r.score)}),e("td",{class:"r num",children:W(r.mcapSol,o)}),e("td",{style:"white-space:normal",children:[e(x,{tone:r.decision==="entered"?"good":r.decision==="blocked"?void 0:r.decision==="failed"?"warn":"flare",children:r.decision})," ",e("span",{class:"faint",children:r.reason?Te[r.reason]??r.reason:""})]})]},r.id))})]})})}):e(A,{children:"Every time a coin crosses your score it is logged here with what the bot did about it."})}function pn({open:t}){let[n,o]=b(null),r=_(a=>a.solUsd);return O(()=>{let a=()=>E("/api/narratives").then(l=>o(l.clusters)).catch(()=>o([]));a();let s=setInterval(a,15e3);return()=>clearInterval(s)},[]),n?n.length?e("div",{class:"list",children:[e("p",{class:"muted",style:"margin:0 0 4px",children:"Same idea, many coins: attention coordinates on one. Leaders (biggest market cap) tend to keep the flow; copies usually fade."}),n.map(a=>e("button",{class:"coin",onClick:()=>a.leader&&t(a.leader),children:[e("div",{class:"score b2",style:"font-size:15px",children:[a.size,e("small",{children:"COINS"})]}),e("div",{class:"body",children:[e("div",{class:"title",children:e("span",{class:"sym",children:a.key.replace(/^(t|w|tw|x):/,s=>({"t:":"$","w:":"","tw:":"tweet ","x:":"@"})[s]??"")})}),e("div",{class:"meta",children:[e("span",{children:["leader ",e("b",{children:["$",a.leaderSymbol??"?"]})," ",a.leaderName?`\\xB7 ${a.leaderName}`:""]}),e("span",{children:W(a.leaderMcap,r)}),a.leaderScore!==void 0&&e("span",{children:["score ",Math.round(a.leaderScore)]}),e("span",{children:["first ",_e(a.firstTs)]})]})]})]},a.key))]}):e(A,{children:"No narrative clusters in the last hour yet. When several coins launch around the same name, ticker or tweet, they group here \\u2014 and the market usually picks one winner."}):e(A,{children:"Loading\\u2026"})}function mn(){let[t,n]=b(null);return O(()=>{E("/api/wallets").then(n).catch(()=>n({wallets:[]}))},[]),t?e("div",{class:"card flat",children:[e("h3",{children:"Learned from the order flow"}),e("p",{class:"muted",style:"margin-top:0",children:[t.tracked?.toLocaleString()," wallets tracked \\xB7 ",e("b",{children:t.smart})," currently qualify as smart (\\u22658 closed coins, high win rate and ROI, not serial devs). They are a score input, never a copy-trade rule."]}),t.wallets.length===0?e(A,{children:"Needs a few hours of data before wallets have enough closed trades to judge."}):e("div",{class:"tablewrap",children:e("table",{children:[e("thead",{children:e("tr",{children:[e("th",{children:"Wallet"}),e("th",{class:"r",children:"Coins"}),e("th",{class:"r",children:"Win"}),e("th",{class:"r",children:"Avg ROI"}),e("th",{class:"r",children:"Profit"}),e("th",{children:"Tags"})]})}),e("tbody",{children:t.wallets.map(o=>e("tr",{children:[e("td",{class:"mono",children:N.demo?e("span",{class:"mono",children:J(o.address)}):e("a",{href:`https://solscan.io/account/${o.address}`,target:"_blank",rel:"noopener",children:J(o.address)})}),e("td",{class:"r num",children:o.closed}),e("td",{class:"r num",children:S(o.winRate)}),e("td",{class:"r num",children:S(o.avgRoi)}),e("td",{class:`r num ${o.pnl>=0?"good":"bad"}`,children:[o.pnl.toFixed(2)," SOL"]}),e("td",{children:o.tags.map(r=>e(x,{tone:r==="smart"?"good":r==="serial-dev"||r==="bundler"?"bad":void 0,children:r},r))})]},o.address))})]})})]}):e(A,{children:"Loading\\u2026"})}function hn(){let t=_(l=>l.health),n=_(l=>l.connected),[o,r]=b([]);if(O(()=>{E("/api/logs").then(l=>r(l.lines)).catch(()=>{})},[]),!t)return e(A,{children:"Loading\\u2026"});let a=Date.now(),s=t.feeds.some(l=>l.critical&&l.status==="open");return e("div",{class:"grid",children:[!s&&e("div",{class:"banner bad",style:"margin:0",children:"No live trade stream. The bot needs the Solana RPC firehose (free Helius key) or a PumpPortal API key to score coins \\u2014 see Setup & help."}),e("div",{class:"card",children:[e("h2",{children:"Data feeds"}),e("div",{class:"tablewrap",children:e("table",{children:[e("thead",{children:e("tr",{children:[e("th",{children:"Feed"}),e("th",{children:"Status"}),e("th",{class:"r",children:"Messages"}),e("th",{class:"r",children:"Last"}),e("th",{class:"r",children:"Reconnects"})]})}),e("tbody",{children:t.feeds.map(l=>e("tr",{children:[e("td",{children:[l.name," ",l.critical&&e(x,{children:"primary"})]}),e("td",{style:"white-space:normal",children:[e("span",{class:`dot ${l.status==="open"?"on":l.status==="connecting"?"mid":"off"}`,style:"display:inline-block;margin-right:6px"}),l.status,l.note?e("span",{class:"faint",children:[" \\xB7 ",l.note]}):null]}),e("td",{class:"r num",children:l.msgs.toLocaleString()}),e("td",{class:"r num",children:l.lastMsgAt?`${Math.round((a-l.lastMsgAt)/1e3)}s`:"\\u2014"}),e("td",{class:"r num",children:l.reconnects})]},l.name))})]})})]}),e("div",{class:"grid two",children:[e("div",{class:"card",children:[e("h2",{children:"Engine"}),e("dl",{class:"kv",children:[e("dt",{children:"Dashboard link"}),e("dd",{children:n?"live":"reconnecting\\u2026"}),e("dt",{children:"Uptime"}),e("dd",{children:[(t.uptimeSec/3600).toFixed(1)," h"]}),e("dt",{children:"Events processed"}),e("dd",{children:t.events?.toLocaleString()}),e("dt",{children:"Coins in memory / scored"}),e("dd",{children:[t.tokens," / ",t.scored]}),e("dt",{children:"Launches \\xB7 trades seen"}),e("dd",{children:[t.creates?.toLocaleString()," \\xB7 ",t.trades?.toLocaleString()]}),e("dt",{children:"PumpSwap swaps (unmapped)"}),e("dd",{children:[t.ammSwaps?.toLocaleString()," (",t.unmappedAmm,")"]}),e("dt",{children:"Reserve convention"}),e("dd",{children:t.ammReserveConvention}),e("dt",{children:"Wallets / smart"}),e("dd",{children:[t.wallets?.toLocaleString()," / ",t.smartWallets]}),e("dt",{children:"Outcomes tracking / resolved"}),e("dd",{children:[t.hypotheticalsOpen?.toLocaleString()," / ",t.samplesResolved?.toLocaleString()]}),e("dt",{children:"Errors \\xB7 bad events"}),e("dd",{children:[t.errors," \\xB7 ",t.badEvents]}),e("dt",{children:"Event-loop lag"}),e("dd",{children:[t.loopLagMs??0," ms"]}),e("dt",{children:"Memory \\xB7 disk"}),e("dd",{children:[t.memMb??"?"," MB \\xB7 ",t.diskMb??"?"," MB"]})]})]}),e("div",{class:"card",children:[e("h2",{children:"Server configuration"}),e("dl",{class:"kv",children:Object.entries(t.config??{}).map(([l,u])=>e(L,{children:[e("dt",{children:l}),e("dd",{children:Array.isArray(u)?u.join(", "):String(u)})]}))})]})]}),e("div",{class:"card",children:[e("h2",{children:"Recent log"}),e("div",{class:"tablewrap",style:"max-height:340px;overflow-y:auto",children:e("table",{children:e("tbody",{children:o.map((l,u)=>e("tr",{children:[e("td",{class:"faint num",children:ne(l.ts)}),e("td",{children:e(x,{tone:l.level==="error"?"bad":l.level==="warn"?"warn":void 0,children:l.level})}),e("td",{style:"white-space:normal",children:l.msg})]},u))})})})]})]})}function fn(){return e("div",{class:"card",style:"margin-top:12px",children:[e("h2",{children:"How it works"}),e("p",{style:"margin-top:0",children:"The bot runs on a computer that stays on \\u2014 yours, a VPS or a cloud container \\u2014 not in this page. Closing the browser or locking your phone does not stop it; Telegram keeps you posted when you are away."}),e("p",{class:"muted",style:"font-size:13px;margin-bottom:0",children:"Live orders are built by PumpPortal\'s local API (0.5% fee), signed on your computer (the key never leaves it), sent through your RPC and confirmed; the real fill is read back from the chain. Four errors in a row or the daily limit pause live entries; exits always go through. A stop loss is a market sell, not a guarantee: in a rug the fill can land far below it."})]})}function qe(t,n){try{let o=localStorage.getItem(`signal.${t}`);return o===null?n:JSON.parse(o)}catch{return n}}function At(t,n){try{localStorage.setItem(`signal.${t}`,JSON.stringify(n))}catch{}}function $t({open:t}){let n=_(p=>p.rows),o=_(p=>p.solUsd),r=_(p=>p.settings),[a,s]=b(qe("stage","all")),[l,u]=b(qe("sort","score")),[h,d]=b(qe("minview",0)),i=r?.minScore??75,c=n.filter(p=>(a==="all"||p.stage===a)&&p.score>=h);c=[...c].sort((p,k)=>l==="new"?k.createdAt-p.createdAt:l==="mcap"?k.mcapSol-p.mcapSol:k.score-p.score);let f=n.filter(p=>p.score>=i).length,m=(p,k,T,v,y)=>e("button",{class:"chip","aria-pressed":k===p,onClick:()=>{T(p),At(v,p)},children:y});return e("div",{children:[e("div",{class:"section-title",children:[e("h2",{children:"Live radar"}),e("span",{class:"muted num",children:[n.length," coins scored \\xB7 ",e("b",{class:"flare",children:f})," at \\u2265 ",i]})]}),e("div",{class:"row wrap",style:"gap:8px;margin-bottom:12px",children:[e("div",{class:"chips",children:[m("all",a,s,"stage","All"),m("curve",a,s,"stage","Bonding curve"),m("amm",a,s,"stage","Graduated")]}),e("div",{class:"chips",children:[m("score",l,u,"sort","Top score"),m("new",l,u,"sort","Newest"),m("mcap",l,u,"sort","Market cap")]}),e("div",{class:"chips",children:[0,50,i].map(p=>e("button",{class:"chip","aria-pressed":h===p,onClick:()=>{d(p),At("minview",p)},children:p===0?"Any score":`\\u2265 ${p}`},p))})]}),c.length===0?e(A,{children:n.length===0?"Waiting for coins\\u2026 the radar fills as launches and trades stream in.":"No coins match these filters right now."}):e("div",{class:"list",children:c.map(p=>e(gn,{r:p,solUsd:o,threshold:i,onOpen:()=>t(p.mint)},p.mint))})]})}function gn({r:t,solUsd:n,threshold:o,onOpen:r}){let a=t.why.filter(l=>l.points>0).slice(0,2),s=t.why.filter(l=>l.points<0).slice(0,1);return e("button",{class:`coin ${t.held?"held":""}`,onClick:r,children:[e(ke,{value:t.score,small:t.stage==="amm"?"DEX":"CURVE"}),e("div",{class:"body",children:[e("div",{class:"title",children:[e("span",{class:"sym",children:["$",t.symbol||"?"]}),e("span",{class:"name",children:t.name}),t.held&&e(x,{tone:"flare",children:"holding"}),t.score>=o&&!t.held&&(t.spent?e(x,{children:"passed"}):e(x,{tone:"good",children:"signal"}))]}),e("div",{class:"meta num",children:[e("span",{children:W(t.mcapSol,n)}),e("span",{children:[Q(t.ageSec)," old"]}),e("span",{class:t.net60>=0?"good":"bad",children:[t.net60>=0?"+":"",t.net60.toFixed(2)," SOL/1m"]}),e("span",{children:[t.buyers," buyers"]}),e("span",{children:["top10 ",S(t.top10)]})]}),t.stage==="curve"&&e("div",{class:"bar",title:`bonding curve ${S(t.progress)}`,children:e("i",{style:{width:`${Math.max(2,t.progress*100)}%`}})}),e("div",{class:"why",children:[a.map(l=>`\\u25B2 ${l.note||l.label}`).join("  "),s.length>0&&`  \\u25BC ${s[0].note||s[0].label}`]}),t.flags.length>0&&e("div",{class:"chips",style:"margin-top:6px",children:t.flags.slice(0,4).map(l=>e(x,{tone:/smart|leader/.test(l)?"good":/bundled|dev sold|serial|concentrated|copycat/.test(l)?"bad":void 0,children:l},l))})]})]})}function Ot({mint:t,close:n}){let o=_(i=>i.solUsd),r=_(i=>i.settings),[a,s]=b(null),[l,u]=b("");O(()=>{let i=!0,c=()=>E(`/api/token/${encodeURIComponent(t)}`).then(p=>i&&s(p)).catch(p=>i&&u(String(p.message??p)));c();let f=setInterval(c,3e3),m=p=>p.key==="Escape"&&n();return window.addEventListener("keydown",m),()=>{i=!1,clearInterval(f),window.removeEventListener("keydown",m)}},[t]);let h=a?.score,d=Math.max(8,...(h?.contributions??[]).map(i=>Math.abs(i.points)));return e("div",{class:"sheet-bg",onClick:i=>i.target===i.currentTarget&&n(),children:e("div",{class:"sheet",role:"dialog","aria-modal":"true","aria-label":"coin details",children:[e("div",{class:"grab"}),!a&&!l&&e(A,{children:"Loading\\u2026"}),l&&e(A,{children:l}),a&&e("div",{class:"grid",children:[e("div",{class:"row",style:"align-items:flex-start",children:[h&&e(ke,{value:h.score,small:a.stage==="amm"?"DEX":"CURVE"}),e("div",{style:"flex:1;min-width:0",children:[e("div",{style:"font-size:19px;font-weight:780",children:["$",a.symbol||"?"]}),e("div",{class:"muted",style:"overflow:hidden;text-overflow:ellipsis",children:a.name}),e("div",{class:"chips",style:"margin-top:6px",children:[e(x,{children:a.stage==="curve"?`curve ${S(a.progress)}`:a.stage==="amm"?"graduated \\xB7 PumpSwap":"migrating"}),h?.calibrated&&e(x,{tone:"good",children:["P(win) ",S(h.p)]}),a.narrative?.clusterSize>1&&e(x,{tone:a.narrative.isLeader?"good":"bad",children:[a.narrative.isLeader?"leads":"follows"," a ",a.narrative.clusterSize,"-coin narrative"]}),a.partial&&e(x,{tone:"warn",children:"joined late"})]})]}),e("button",{class:"btn ghost",onClick:n,"aria-label":"close",children:"\\u2715"})]}),e(vn,{d:a,threshold:r?.minScore??75,enabled:!!r?.enabled}),e("div",{class:"stats",children:[e("div",{class:"stat",children:[e("div",{class:"k",children:"Market cap"}),e("div",{class:"v num",children:W(a.mcapSol,o)}),o>0&&e("div",{class:"s num",children:[a.mcapSol.toFixed(1)," SOL"]})]}),e("div",{class:"stat",children:[e("div",{class:"k",children:"Peak"}),e("div",{class:"v num",children:W(a.athMcapSol,o)}),e("div",{class:"s num",children:a.mcapSol>0?`${((a.mcapSol/a.athMcapSol-1)*100).toFixed(0)}% from peak`:""})]}),e("div",{class:"stat",children:[e("div",{class:"k",children:"Age"}),e("div",{class:"v num",children:Q((Date.now()-a.createdAt)/1e3)})]}),e("div",{class:"stat",children:[e("div",{class:"k",children:"Holders"}),e("div",{class:"v num",children:a.concentration?.holders??"\\u2014"}),e("div",{class:"s",children:["top10 ",S(a.concentration?.top10)]})]})]}),e("div",{class:"row wrap",style:"gap:8px",children:[N.demo?e("span",{class:"faint",style:"font-size:12.5px",children:"Simulated coin \\u2014 no explorer links in the demo."}):e(L,{children:[e("a",{class:"btn sm",href:`https://pump.fun/coin/${a.mint}`,target:"_blank",rel:"noopener",children:"pump.fun"}),e("a",{class:"btn sm",href:`https://dexscreener.com/solana/${a.mint}`,target:"_blank",rel:"noopener",children:"DexScreener"}),e("a",{class:"btn sm",href:`https://solscan.io/token/${a.mint}`,target:"_blank",rel:"noopener",children:"Solscan"}),a.meta?.twitter&&e("a",{class:"btn sm",href:a.meta.twitter,target:"_blank",rel:"noopener",children:"X / Twitter"}),a.meta?.telegram&&e("a",{class:"btn sm",href:a.meta.telegram,target:"_blank",rel:"noopener",children:"Telegram"})]}),e("button",{class:"btn sm",onClick:()=>{navigator.clipboard?.writeText(a.mint).catch(()=>{})},children:"Copy address"})]}),h&&e("div",{class:"card flat",children:[e("h3",{children:"Why this score"}),e("div",{class:"contrib",children:h.contributions.map(i=>e(L,{children:[e("div",{children:[e("div",{style:"font-weight:650",children:[i.label," ",e("span",{class:"faint num",children:["\\xB7 ",i.value]})]}),e("div",{class:"cbar","aria-hidden":"true",children:[e("span",{class:"mid"}),e("i",{style:{left:i.points>=0?"50%":`${50-Math.abs(i.points)/d*50}%`,width:`${Math.abs(i.points)/d*50}%`,background:i.points>=0?"var(--good)":"var(--bad)"}})]})]}),e("div",{class:`num ${i.points>=0?"good":"bad"}`,style:"text-align:right",children:[i.points>=0?"+":"",i.points.toFixed(1)," pts",e("div",{class:"faint",style:"font-size:11px",children:i.note})]})]}))})]}),e("div",{class:"grid two",children:[e("div",{class:"card flat",children:[e("h3",{children:"Top holders"}),a.holders.length===0?e(A,{children:"No holders tracked yet."}):e("div",{class:"tablewrap",children:e("table",{children:e("tbody",{children:a.holders.map(i=>e("tr",{children:[e("td",{class:"mono",children:e("a",{href:N.demo?void 0:`https://solscan.io/account/${i.addr}`,target:"_blank",rel:"noopener",children:J(i.addr)})}),e("td",{children:[i.dev&&e(x,{tone:"bad",children:"dev"})," ",i.bundle&&e(x,{tone:"bad",children:"bundle"})," ",i.early&&!i.bundle&&e(x,{tone:"warn",children:"sniper"})," ",i.smart&&e(x,{tone:"good",children:"smart"})]}),e("td",{class:"r num",children:[i.pct.toFixed(2),"%"]})]},i.addr))})})})]}),e("div",{class:"card flat",children:[e("h3",{children:"Latest trades"}),e("div",{class:"tablewrap",style:"max-height:320px;overflow-y:auto",children:e("table",{children:e("tbody",{children:a.trades.map((i,c)=>e("tr",{children:[e("td",{class:"faint num",children:ne(i.ts)}),e("td",{class:i.buy?"good":"bad",children:i.buy?"buy":"sell"}),e("td",{class:"r num",children:[i.sol.toFixed(3)," SOL"]}),e("td",{class:"mono faint",children:J(i.user)})]},c))})})})]})]}),a.creatorStats&&e("div",{class:"card flat",children:[e("h3",{children:"Dev"}),e("dl",{class:"kv",children:[e("dt",{children:"Wallet"}),e("dd",{class:"mono",children:e("a",{href:N.demo?void 0:`https://solscan.io/account/${a.creator}`,target:"_blank",rel:"noopener",children:J(a.creator)})}),e("dt",{children:"Launches (24h / seen)"}),e("dd",{children:[a.creatorStats.launches24h," / ",a.creatorStats.launches]}),e("dt",{children:"Best previous coin"}),e("dd",{children:a.creatorStats.best?`${a.creatorStats.best.toFixed(0)} SOL mcap`:"\\u2014"}),e("dt",{children:"Dev holds / sold"}),e("dd",{children:[S(a.features?.devShare,1)," / ",S(a.features?.devSold)]})]})]}),a.positions?.length>0&&e("div",{class:"card flat",children:[e("h3",{children:"Your trades on this coin"}),a.positions.map(i=>e("div",{class:"row",style:"justify-content:space-between;padding:6px 0",children:[e("span",{children:[i.mode," \\xB7 ",i.status," ",i.exitReason?`\\xB7 ${i.exitReason}`:""]}),e("span",{class:`num ${(i.pnl??i.proceeds+i.value-i.cost)>=0?"good":"bad"}`,children:[V((i.pnl??i.proceeds+i.value-i.cost)||0)," SOL"]})]},i.id))]})]})]})})}function vn({d:t,threshold:n,enabled:o}){let r=t.entry;if(!r)return null;let a=r.signals?.[r.signals.length-1],s=t.score?.score??0,l="",u;if(a){let h=a.decision==="entered"?"the bot bought it":a.decision==="pending"?"the bot is buying it":a.decision==="failed"?`the buy failed (${a.reason??"no fill"})`:`not bought \\u2014 ${Te[a.reason]??a.reason}`;l=a.decision==="entered"||a.decision==="pending"?"good":"warn",u=`Entry moment at ${ne(a.ts)}, score ${Math.round(a.score)}: ${h}. Each coin gets one entry moment.`}else r.spent?u="Its entry moment has passed (before the current settings, or before this session). Each coin gets one.":s>=n?(l="good",u=o?`At your score \\u2014 buying once it holds ${r.need} evaluations in a row (${r.above}/${r.need}).`:"At your score, but auto-trading is paused."):u=`Below your score of ${n}. If it gets there and holds, that is its entry moment.`;return e("div",{class:`entrymoment ${l}`,role:"status",children:u})}var bn={tp:"take profit",sl:"stop loss",trail:"trailing stop",initials:"stake back",time:"max hold time",dead:"coin went quiet",manual:"closed by you",kill:"kill switch",external:"not in wallet"};function Nt({open:t}){let n=_(s=>s.account),o=_(s=>s.solUsd);if(!n)return e(A,{children:"Loading\\u2026"});let r=n.closed.filter(s=>s.status==="closed"),a=n.wins+n.losses>0?n.wins/(n.wins+n.losses):NaN;return e("div",{children:[e("div",{class:"section-title",children:[e("h2",{children:n.mode==="live"?"Live trading":"Paper trading"}),e("span",{class:"muted",children:n.mode==="live"?"real SOL":"simulated fills on the real order flow"})]}),e("div",{class:"card",children:[e("div",{class:"stats",children:[e(ie,{k:n.mode==="live"?"Realized":"Paper equity",v:n.mode==="live"?`${V(n.realized)} SOL`:`${V(n.equity)} SOL`,s:n.mode==="live"?void 0:`cash ${V(n.paperBalance)} + open ${V(n.openValue)}`}),e(ie,{k:"Today",v:`${n.dayPnl>=0?"+":""}${V(n.dayPnl)} SOL`,tone:n.dayPnl>0?"good":n.dayPnl<0?"bad":""}),e(ie,{k:"All time",v:`${n.realized>=0?"+":""}${V(n.realized)} SOL`,tone:n.realized>0?"good":n.realized<0?"bad":"",s:`fees paid ${V(n.fees)} SOL`}),e(ie,{k:"Win rate",v:Number.isFinite(a)?`${(a*100).toFixed(0)}%`:"\\u2014",s:`${n.wins} won \\xB7 ${n.losses} lost`})]}),e("div",{style:"margin-top:10px",children:e(_t,{points:n.equityCurve})})]}),e("div",{class:"section-title",children:[e("h2",{children:"Open positions"}),e("span",{class:"muted num",children:n.open.length})]}),n.open.length===0?e(A,{children:"No open positions. When a coin reaches your score, the bot buys it here."}):e("div",{class:"list",children:n.open.map(s=>e(yn,{p:s,solUsd:o,open:t},s.id))}),e("div",{class:"section-title",children:[e("h2",{children:"Closed"}),e("span",{class:"muted num",children:[r.length," recent"]})]}),n.closed.length===0?e(A,{children:"Closed trades appear here with their exit reason and result after fees."}):e("div",{class:"card flat",style:"padding:4px 8px",children:e("div",{class:"tablewrap",children:e("table",{children:[e("thead",{children:e("tr",{children:[e("th",{children:"Coin"}),e("th",{children:"Exit"}),e("th",{class:"r",children:"Score"}),e("th",{class:"r",children:"Held"}),e("th",{class:"r",children:"Result"})]})}),e("tbody",{children:n.closed.map(s=>e("tr",{style:"cursor:pointer",onClick:()=>t(s.mint),children:[e("td",{children:[e("b",{children:["$",s.symbol||"?"]})," ",e("span",{class:"faint",children:s.mode==="live"?"live":""})]}),e("td",{children:s.status==="failed"?e(x,{tone:"warn",children:["not filled \\xB7 ",s.exitReason]}):bn[s.exitReason??""]??s.exitReason}),e("td",{class:"r num",children:Math.round(s.signalScore)}),e("td",{class:"r num",children:s.closedAt?Q((s.closedAt-s.openedAt)/1e3):"\\u2014"}),e("td",{class:`r num ${(s.pnl??0)>0?"good":(s.pnl??0)<0?"bad":""}`,children:[s.status==="failed"?"\\u2014":`${(s.pnlPct??0)>=0?"+":""}${(s.pnlPct??0).toFixed(1)}%`,e("div",{class:"faint",style:"font-size:11px",children:s.status==="failed"?"":`${V(s.pnl??0)} SOL`})]})]},s.id))})]})})})]})}function yn({p:t,solUsd:n,open:o}){let a=((t.cost>0?(t.proceeds+t.value)/t.cost:1)-1)*100,s=t.plan.tpPct,l=t.plan.slPct,u=s+l,h=Math.min(1,Math.max(0,(a+l)/u)),d=async()=>{try{await E(`/api/positions/${encodeURIComponent(t.id)}/close`,{}),w("Sell order sent")}catch(i){w(String(i.message))}};return e("div",{class:"card flat",children:[e("div",{class:"row",children:[e("button",{class:"btn ghost",style:"padding:0;min-height:0;text-align:left;flex:1",onClick:()=>o(t.mint),children:[e("div",{style:"font-weight:760;font-size:15px",children:["$",t.symbol||"?"," ",e("span",{class:"faint",style:"font-weight:500;font-size:12.5px",children:t.name})]}),e("div",{class:"muted num",style:"font-size:12.5px",children:[t.status==="opening"?"buying\\u2026":t.status==="closing"?"selling\\u2026":`held ${Q((Date.now()-t.openedAt)/1e3)}`," \\xB7 score ",Math.round(t.signalScore)," \\xB7 in at ",W(t.entryMcapSol||t.signalMcapSol,n),t.tpHit?" \\xB7 trailing":""]})]}),e("div",{style:"text-align:right",children:[e("div",{class:`num ${a>=0?"good":"bad"}`,style:"font-size:19px;font-weight:780",children:t.status==="opening"?"\\u2026":`${a>=0?"+":""}${a.toFixed(1)}%`}),e("div",{class:"faint num",style:"font-size:12px",children:[V(t.cost)," SOL in"]})]})]}),e("div",{style:"margin-top:10px",children:[e("div",{class:"row faint num",style:"justify-content:space-between;font-size:11.5px",children:[e("span",{children:["SL \\u2212",l,"%"]}),e("span",{children:"entry"}),e("span",{children:["TP +",s,"%"]})]}),e("div",{class:"cbar",style:"margin-top:4px;height:10px",children:[e("span",{class:"mid",style:{left:`${l/u*100}%`}}),e("i",{style:{left:`calc(${h*100}% - 5px)`,width:"10px",background:a>=0?"var(--good)":"var(--bad)",borderRadius:"5px"}})]})]}),e("div",{class:"row",style:"justify-content:space-between;margin-top:10px",children:[e("span",{class:"faint",style:"font-size:12px",children:t.notes.slice(-1)[0]??`opened ${_e(t.openedAt)}`}),e("button",{class:"btn sm",disabled:t.status!=="open",onClick:d,children:"Sell now"})]})]})}var Dt=[["radar","Radar"],["trades","Trades"],["bot","Bot"],["learn","Learn"],["more","More"]],Ht=t=>Dt.some(([n])=>n===t);function _n(){let t=location.hash.replace("#","");return Ht(t)?t:"radar"}function Sn(){let[t,n]=b(""),[o,r]=b(""),[a,s]=b(!1);return e("div",{class:"login",children:[e("div",{class:"brand",style:"font-size:15px;margin-bottom:18px",children:[e(It,{})," SIGNAL"]}),e("form",{class:"card",onSubmit:async u=>{u.preventDefault(),s(!0),r("");try{await E("/api/login",{token:t}),await j(),xe()}catch(h){r(String(h.message))}finally{s(!1)}},children:[e("h2",{children:"Unlock the dashboard"}),e("p",{class:"muted",style:"margin-top:0",children:"Enter the access token printed in the server log on first start (or your DASHBOARD_TOKEN)."}),e("input",{id:"token",class:"inp",style:"max-width:none",type:"password",autoComplete:"current-password",placeholder:"access token",value:t,onInput:u=>n(u.target.value)}),o&&e("p",{class:"bad",style:"margin:8px 0 0",children:o}),e("button",{class:"btn primary",style:"margin-top:12px;width:100%",disabled:a||!t,children:a?"Checking\\u2026":"Unlock"})]})]})}function It(){return e("svg",{width:"22",height:"22",viewBox:"0 0 32 32","aria-hidden":"true",children:[e("rect",{width:"32",height:"32",rx:"7",fill:"var(--ink)"}),e("path",{d:"M6 22 L12 14 L17 18 L26 8",stroke:"var(--flare)","stroke-width":"3.2",fill:"none","stroke-linecap":"round","stroke-linejoin":"round"})]})}function Bt(){let t=_(p=>p.authed),n=_(p=>p.settings),o=_(p=>p.account),r=_(p=>p.health),a=_(p=>p.connected),s=_(p=>p.toast),l=_(p=>p.nav),[u,h]=b(_n()),[d,i]=b(null);if(O(()=>{l&&Ht(l.tab)&&(h(l.tab),i(null),window.scrollTo({top:0}))},[l?.at]),O(()=>{j().then(()=>{He().authed&&xe()});let p=setInterval(()=>void j(),15e3),k=()=>{document.visibilityState==="visible"&&j().then(()=>He().authed&&xe())};return document.addEventListener("visibilitychange",k),()=>{clearInterval(p),yt(),document.removeEventListener("visibilitychange",k)}},[]),t===!1&&!N.demo)return e(Sn,{});if(t!==!0||!n)return e("div",{class:"empty",style:"margin-top:30vh",children:N.demo?"Starting the simulated market\\u2026":"Connecting to SIGNAL\\u2026"});let c=!r?.feedDown,f=p=>{h(p);try{history.replaceState(null,"",`#${p}`)}catch{}window.scrollTo({top:0})},m=o?.dayPnl??0;return e("div",{class:"app",children:[e("header",{class:"top",children:e("div",{class:"top-row",children:[e("div",{class:"brand",children:[e(It,{})," SIGNAL"]}),e("span",{class:"pill",title:c?"data feeds live":"data feed down",children:[e("span",{class:`dot ${a?c?"on":"off":"mid"}`}),n.enabled?"Trading":"Paused"," \\xB7 ",n.mode==="live"?"LIVE":"paper"]}),e("span",{class:"spacer"}),e("span",{class:`top-pnl num ${m>0?"good":m<0?"bad":"muted"}`,title:"today, SOL",children:[gt(m)," SOL"]})]})}),r?.simulated&&e("div",{class:"banner sim",children:[e("span",{style:"flex:1",children:N.demo?"DEMO \\u2014 the real engine on a simulated market in this page. Fake coins, fake money.":"SIMULATED MARKET \\u2014 demo data, not real coins or prices."}),N.bannerAction?.()]}),o?.killed&&e("div",{class:"banner bad",children:"Kill switch is ON \\u2014 no new entries."}),!N.demo&&r?.config?.rpcIsPublic&&!r.simulated&&e("div",{class:"banner sim",children:[e("span",{style:"flex:1",children:"Setup needed: the bot is on the slow public data feed. Add your free Helius key."}),e("button",{class:"btn sm",onClick:()=>se("more","setup"),children:"Set up"})]}),r&&r.feedDown&&!r.simulated&&e("div",{class:"banner bad",children:"Live data feed is down \\u2014 the bot will not open trades until it recovers."}),e("nav",{class:"tabs","aria-label":"sections",children:Dt.map(([p,k])=>e("button",{class:"tab","aria-current":u===p?"page":void 0,onClick:()=>f(p),children:[xt[p],k]},p))}),e("main",{class:"main",children:[u==="radar"&&e($t,{open:i}),u==="trades"&&e(Nt,{open:i}),u==="bot"&&e(Tt,{}),u==="learn"&&e(Lt,{}),u==="more"&&e(Rt,{open:i})]}),d&&e(Ot,{mint:d,close:()=>i(null)}),s&&e("div",{class:"toast",role:"status",children:s})]})}z({});st(e(Bt,{}),document.getElementById("root"));})();\n</script>\n</body>\n</html>\n';
  const here = dirname(fileURLToPath(import.meta.url));
  for (const p of [join4(here, "dashboard.html"), join4(here, "../dist/dashboard.html"), join4(process.cwd(), "dist/dashboard.html")]) {
    if (existsSync4(p)) return readFileSync5(p, "utf8");
  }
  return "<!doctype html><title>SIGNAL</title><p>Dashboard not built. Run <code>npm run build</code>.</p>";
}
async function main() {
  loadDotEnv();
  const baseEnv = { ...process.env };
  const setup = new SetupStore(resolve2(process.env.DATA_DIR ?? "./data"));
  setup.applyTo(process.env);
  const effective = (k) => setup.read()[k] ?? baseEnv[k] ?? "";
  const config = loadConfig();
  const log = new ServerLog(config.logLevel);
  const store = new DataStore(config.dataDir, log);
  let token = config.dashboardToken || store.readSecret() || "";
  if (!token) {
    token = randomBytes(18).toString("base64url");
    store.writeSecret(token);
  }
  const model = store.loadModel() ?? priorModel(Date.now());
  let server = null;
  let telegram = null;
  let live = null;
  let pumpportal = null;
  let metadata = null;
  let pools = null;
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
      onSettings: (s) => server?.broadcast("settings", s),
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
  if (saved) engine.restore(saved);
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
    rpc = new RpcLogsFeed({ url: config.rpcWs, log, onEvent: (ev) => router.push(ev), onHealth });
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
  const hk = setInterval(() => {
    try {
      store.saveWallets(engine.wallets.snapshot());
      diskMb = store.diskUsageMb();
    } catch (e) {
      log.warn("wallet snapshot failed", { err: String(e) });
    }
  }, 10 * 6e4);
  const heapLimit = getHeapStatistics().heap_size_limit;
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
    store.backupState();
  }, 36e5);
  store.cleanup(config.recordDays, config.sampleDays);
  store.backupState();
  const learner = new Learner({
    store,
    engine: () => engine,
    log,
    everyHours: config.learnEveryHours,
    sampleDays: config.sampleDays,
    onAdopt: (v) => telegram?.send(`\u{1F9E0} New scoring model adopted: ${v}`),
    onTune: (m) => telegram?.send(m),
    onEdges: (m) => telegram?.send(m)
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
      simulated: config.feeds.has("sim")
    })
  });
  await server.listen(config.port, config.host);
  const shown = config.dashboardToken ? "(from DASHBOARD_TOKEN)" : token;
  const lan = lanAddress();
  log.info("================================================================");
  log.info(`SIGNAL running \u2014 dashboard on port ${config.port}`);
  log.info(`On this computer: http://localhost:${config.port}  (no token needed)`);
  if (lan) log.info(`On your phone at home (same Wi-Fi): http://${lan}:${config.port}/?token=${config.dashboardToken ? "<your DASHBOARD_TOKEN>" : token}`);
  log.info(`Access token ${shown}`);
  log.info(`Feeds: ${[...config.feeds].join(", ")} \xB7 mode ${engine.settings.mode} \xB7 auto-trading ${engine.settings.enabled ? "ON" : "off"}`);
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
    console.error("SIGNAL failed to start:", e);
    process.exit(1);
  });
}
export {
  main
};
