var util = require('util');
var PixelStream = require('pixel-stream');
var ColorTransform = require('color-transform');
var nq = require('neuquant');

function ImageEncoder(type, opts) {
  PixelStream.call(this);
  
  var encoder = ImageEncoder.find(type, opts);
  if (!encoder)
    throw new Error('Unsupported image encoder: ' + type);
    
  this._input = encoder;
  this._output = encoder;
}

util.inherits(ImageEncoder, PixelStream);

// returns whether the given color space includes an alpha channel
function hasAlpha(cs) {
  return cs[cs.length - 1] === 'a';
}

ImageEncoder.prototype._start = function(done) {
  var format = this.format;
  var colorSpace = format.colorSpace;
  var cs = (this._input.supportedColorSpaces || ['rgb']).slice();
  
  if (cs.indexOf(colorSpace) === -1) {
    // Sort supported encoder color spaces to choose the closest one possible.
    // Currently just finds one that has an alpha channel or not depending on
    // input, and assumes that the color spaces have been otherwise prioritized
    // already by the encoder author.
    var alpha = hasAlpha(colorSpace);
    var sorted = cs.sort(function(a, b) {
      var sa = alpha === hasAlpha(a) ? -1 : 1;
      var sb = alpha === hasAlpha(b) ? -1 : 1;
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });
    
    var outputColorSpace = sorted[0];
    
    // create a color transform
    // if an indexed color space was specified for encoding, 
    // convert to rgb for input into quantizer (below)
    this._input = new ColorTransform(outputColorSpace === 'indexed' ? 'rgb' : outputColorSpace);
    var s = this._input;
    
    // if the output color space is indexed, pipe rgb output from
    // above into a quantizer to produce the palette and indexed output.
    if (outputColorSpace === 'indexed')
      s = s.pipe(new nq.Stream);
    
    // finally, pipe the result into our actual encoder
    s.pipe(this._output);
  }
  
  var self = this;
  this._output.on('data', function(chunk) {
    self.push(chunk);
  });
  
  this._input.emit('pipe', this);
  done();
};

ImageEncoder.prototype._writePixels = function(chunk, done) {
  this._input.write(chunk, done);
};

ImageEncoder.prototype._end = function(done) {
  this._output.once('end', done);
  this._input.end();
};

var encoders = {};
ImageEncoder.register = function(type, encoder) {
  encoders[type] = encoder;
};

ImageEncoder.find = function(type, options) {
  var encoder = encoders[type];
  if (!encoder)
    return null;
    
  return new encoder(options);
};

module.exports = ImageEncoder;
