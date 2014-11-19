var Transform = require('stream').Transform;
var util = require('util');

function ImageDecoder() {
  Transform.call(this);
  this._decoder = null;
}

util.inherits(ImageDecoder, Transform);

ImageDecoder.prototype._transform = function(chunk, encoding, done) {
  // find a decoder by probing using the first chunk
  if (!this._decoder) {
    var decoder = ImageDecoder.probe(chunk);
    if (!decoder)
      return done(new Error('Unsupported image format'));
    
    this._decoder = decoder;
    
    var self = this
    decoder.on('data', function(data) {
      self.push(data);
    });
    
    decoder.once('format', function(format) {
      self.format = format;
      self.emit('format', format);
    });
    
    decoder.on('meta', function(data) {
      self.meta = data;
      self.emit('meta', data);
    });
    
    decoder.on('frame', function(frame) {
      self.emit('frame', frame);
    });
    
    decoder.on('error', function(err) {
      self.emit('error', err);
    });
  }
  
  // write the chunk to the actual decoder
  // ignore errors here since they are handled above
  this._decoder.write(chunk, encoding, function(err) {
    done();
  });
};

ImageDecoder.prototype._flush = function(done) {
  this._decoder.end(done);
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
