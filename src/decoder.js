var Transform = require('stream').Transform;
var util = require('util');

function ImageDecoder() {
  Transform.call(this);
  this._decoder = null;
  
  // update this.format when format events are emitted
  this.on('format', function(format) {
    this.format = format;
  });
}

util.inherits(ImageDecoder, Transform);

ImageDecoder.prototype._transform = function(chunk, encoding, done) {
  // find a decoder by probing using the first chunk
  if (!this._decoder) {
    var decoder = ImageDecoder.probe(chunk);
    if (!decoder)
      return done(new Error('Unsupported image format'));
      
    // proxy events and stream output to this stream
    decoder.emit = this.emit.bind(this);
    decoder.push = this.push.bind(this);
    this._decoder = decoder;
  }
  
  // call _transform on the actual decoder
  this._decoder._transform(chunk, encoding, done);
};

ImageDecoder.prototype._flush = function(done) {
  // call _flush on the decoder if it is implemented
  if (typeof this._decoder._flush === 'function')
    this._decoder._flush(done);
  else
    done();
};

var decoders = [];
ImageDecoder.register = function(decoder) {
  decoders.push(decoder);
};

ImageDecoder.probe = function(chunk, opts) {
  for (var i = 0; i < decoders.length; i++) {
    var decoder = decoders[i];
    if (decoder.probe(chunk))
      return new decoder(opts);
  }
  
  return null;
};

module.exports = ImageDecoder;
