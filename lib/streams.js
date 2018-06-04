"use strict";

var Transform = require('stream').Transform,
    utillib = require('util'),
    mimelib = require("mimelib"),
    encodinglib = require("encoding"),
    crypto = require("crypto"),
    uue = require('uue');

module.exports.Base64Stream = Base64Stream;
module.exports.QPStream = QPStream;
module.exports.BinaryStream = BinaryStream;
module.exports.UUEStream = UUEStream;

function Base64Stream() {
    Transform.call(this);

    this.checksum = crypto.createHash("md5");
    this.length = 0;

    this.current = "";
}
utillib.inherits(Base64Stream, Transform);

Base64Stream.prototype._transform = function(data, encoding, done) {
    this.handleInput(data);
    done();
};

Base64Stream.prototype._flush = function(done) {
    this.emit("meta-data", {
        length: this.length,
        checksum: this.checksum.digest("hex")
    });
    done();
};

Base64Stream.prototype.handleInput = function(data) {
    if (!data || !data.length) {
        return;
    }

    data = (data || "").toString("utf-8");

    var remainder = 0;
    this.current += data.replace(/[^\w\+\/=]/g, '');
    var buffer = new Buffer(this.current.substr(0, this.current.length - this.current.length % 4), "base64");
    if (buffer.length) {
        this.length += buffer.length;
        this.checksum.update(buffer);
        this.push(buffer);
    }
    this.current = (remainder = this.current.length % 4) ? this.current.substr(-remainder) : "";
};

function QPStream(charset) {
    Transform.call(this);

    this.checksum = crypto.createHash("md5");
    this.length = 0;

    this.charset = charset || "UTF-8";
    this.current = undefined;
}
utillib.inherits(QPStream, Transform);

QPStream.prototype._transform = function(data, encoding, done) {
    this.handleInput(data);
    done();
};

QPStream.prototype._flush = function(done) {
    this.internalFlush();
    this.emit("meta-data", {
        length: this.length,
        checksum: this.checksum.digest("hex")
    });
    done();
};

QPStream.prototype.handleInput = function(data) {
    if (!data || !data.length) {
        return;
    }

    data = (data || "").toString("utf-8");
    if (data.match(/^\r\n/)) {
        data = data.substr(2);
    }

    if (typeof this.current != "string") {
        this.current = data;
    } else {
        this.current += "\r\n" + data;
    }
};

QPStream.prototype.internalFlush = function() {
    var buffer = mimelib.decodeQuotedPrintable(this.current, false, this.charset);

    if (this.charset.toLowerCase() == "binary") {
        // do nothing
    } else if (this.charset.toLowerCase() != "utf-8") {
        buffer = encodinglib.convert(buffer, "utf-8", this.charset);
    } else {
        buffer = new Buffer(buffer, "utf-8");
    }

    this.length += buffer.length;
    this.checksum.update(buffer);

    this.push(buffer);
};

function BinaryStream(charset) {
    Transform.call(this);

    this.checksum = crypto.createHash("md5");
    this.length = 0;

    this.charset = charset || "UTF-8";
    this.current = "";
}
utillib.inherits(BinaryStream, Transform);

BinaryStream.prototype._transform = function(data, encoding, done) {
    if (data && data.length) {
        this.length += data.length;
        this.checksum.update(data);
        this.push(data);
    }
    done();
};

BinaryStream.prototype._flush = function(done) {
    if (data && data.length) {
        this.push(data);
    }
    this.emit("meta-data", {
        length: this.length,
        checksum: this.checksum.digest("hex")
    });
    done();
};

// this is not a stream, it buffers data and decodes after end
function UUEStream(charset) {
    Transform.call(this);

    this.checksum = crypto.createHash("md5");
    this.length = 0;
    this.buf = [];
    this.buflen = 0;

    this.charset = charset || "UTF-8";
    this.current = undefined;
}
utillib.inherits(UUEStream, Transform);

UUEStream.prototype._transform = function(data, encoding, done) {
    this.buf.push(data);
    this.buflen += data.length;
    done();
};

UUEStream.prototype._flush = function(done) {
    this.internalFlush();

    this.emit("meta-data", {
        length: this.length,
        checksum: this.checksum.digest("hex")
    });
    done();
};

UUEStream.prototype.internalFlush = function() {
    var buffer = this.decode(Buffer.concat(this.buf, this.buflen));

    this.length += buffer.length;
    this.checksum.update(buffer);

    this.push(buffer);
};

UUEStream.prototype.decode = function(buffer) {
    var filename;

    var re = /^begin [0-7]{3} (.*)/;
    filename = buffer.slice(0, Math.min(buffer.length, 1024)).toString().match(re) || '';
    if (!filename) {
        return new Buffer(0);
    }

    buffer = uue.decodeFile(buffer.toString('ascii').replace(/\r\n/g, '\n'), filename[1]);

    if (this.charset.toLowerCase() == "binary") {
        // do nothing
    } else if (this.charset.toLowerCase() != "utf-8") {
        buffer = encodinglib.convert(buffer, "utf-8", this.charset);
    }

    return buffer;
};
