var ImageDecoder = require('./src/decoder');
var ImageEncoder = require('./src/encoder');

exports.use = function(codec) {
  if (codec.Decoder)
    ImageDecoder.register(codec.Decoder);
  
  if (codec.Encoder && codec.mime)
    ImageEncoder.register(codec.mime, codec.Encoder);
};

exports.decode = function(options) {
  return new ImageDecoder(options);
};

exports.encode = function(mime, options) {
  return new ImageEncoder(mime, options);
};
