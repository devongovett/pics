var pics = require('../');
var assert = require('assert');
var Transform = require('stream').Transform;
var PassThrough = require('stream').PassThrough;
var PixelStream = require('pixel-stream');
var inherits = require('util').inherits;
var concat = require('concat-frames');
var cs = require('concat-stream');
var ColorTransform = require('color-transform');

// An image decoder that emits some events for testing
// using control bytes in the stream:
//  0xff == format event, also used for probing
//          width, height, and colorSpace follow
//  0xfe == meta event. data byte follows.
//  0xfd == emit error
//  0xfc == frame event. data byte follows.
function TestDecoder(format) {
  Transform.call(this);
  this.format = format;
}

inherits(TestDecoder, Transform);

TestDecoder.probe = function(chunk) {
  return chunk[0] === 0xff;
};

TestDecoder.prototype._transform = function(chunk, encoding, done) {
  if (!this._format) {
    this.emit('format', {
      width: chunk[1],
      height: chunk[2],
      colorSpace: ['rgb', 'gray'][chunk[3]]
    });
    
    this._format = true;
    chunk = chunk.slice(4);
    
    if (chunk[0] === 0xfe) {
      this.emit('meta', {
        test: chunk[1]
      });
      
      chunk = chunk.slice(2);
    }
  }
  
  if (chunk[0] === 0xfd) {
    return done(new Error('Decoding error'));
  }
  
  if (chunk[0] === 0xfc) {
    this.emit('frame', {
      d: chunk[1]
    });
    
    chunk = chunk.slice(2);
  }
    
  this.push(chunk);
  done();
};

// A test encoder
// It accepts a parameter to decide what the supported color
// spaces should be and outputs the pixel data unchanged.
function TestEncoder(cs) {
  PixelStream.call(this);
  this.supportedColorSpaces = arguments.length ? cs : ['rgb', 'gray'];
}

inherits(TestEncoder, PixelStream);

TestEncoder.prototype._writePixels = function(chunk, done) {
  this.push(chunk);
  done();
};

// helper function that takes an array of chunks 
// (or a single chunk) and returns a stream
function stream(chunks) {
  var s = new PassThrough;
  if (!Array.isArray(chunks))
    chunks = [chunks];
  
  chunks.forEach(function(c) {
    s.write(c);
  });
  
  s.end();
  return s;
}

describe('pics', function() {
  it('should use a test image encoder and decoder', function() {
    pics.use({
      Decoder: TestDecoder,
      Encoder: TestEncoder,
      mime: 'image/fake'
    });
  });
  
  it('should ignore calls to use without necessary properties', function() {
    pics.use({});
  })
  
  describe('decoder', function() {
    it('should find a decoder and decode', function(done) {
      var d;
      
      stream(new Buffer([ 0xff, 1, 2, 0, 255, 0, 33, 10, 56, 22 ]))
        .pipe(d = pics.decode())
        .pipe(concat(function(frames) {
          assert(d._decoder instanceof TestDecoder);
          
          assert.deepEqual(d.format, {
            width: 1,
            height: 2,
            colorSpace: 'rgb'
          });
          
          assert.deepEqual(frames, [{
            width: 1,
            height: 2,
            colorSpace: 'rgb',
            pixels: new Buffer([ 255, 0, 33, 10, 56, 22 ])
          }]);
          
          done();
        }));
    });
    
    it('should error for unknown image formats', function(done) {
      stream(new Buffer([ 0, 1, 2, 0, 255, 0, 33, 10, 56, 22 ]))
        .pipe(pics.decode())
        .on('error', function(err) {
          assert(err instanceof Error);
          assert.equal(err.message, 'Unsupported image format');
          done();
        });
    });
    
    it('should forward format and metadata events', function(done) {
      var f, m;
      
      stream(new Buffer([ 0xff, 1, 2, 1, 0xfe, 24, 255, 0, 33, 10, 56, 22 ]))
        .pipe(pics.decode())
        .on('format', function(format) {
          f = format;
        })
        .on('meta', function(meta) {
          m = meta;
        })
        .pipe(concat(function(frames) {
          assert.deepEqual(f, {
            width: 1,
            height: 2,
            colorSpace: 'gray'
          });
          
          assert.deepEqual(m, {
            test: 24
          });
          
          done();
        }));
    });
    
    it('should forward decoder errors', function(done) {
      stream(new Buffer([ 0xff, 1, 2, 1, 0xfd, 255, 0, 33, 10, 56, 22 ]))
        .pipe(pics.decode())
        .once('error', function(error) {
          done();
        });
    });
    
    it('should forward frame events', function(done) {
      stream([new Buffer([ 0xff, 1, 1, 0, 0xfc, 243, 255, 0, 33 ]), new Buffer([ 0xfc, 123, 10, 56, 22])])
        .pipe(pics.decode())
        .pipe(concat(function(frames) {
          assert.deepEqual(frames, [{
            d: 243,
            width: 1,
            height: 1,
            colorSpace: 'rgb',
            pixels: new Buffer([ 255, 0, 33 ])
          }, {
            d: 123,
            width: 1,
            height: 1,
            colorSpace: 'rgb',
            pixels: new Buffer([ 10, 56, 22 ])
          }]);
          
          done();
        }));
    });
  });
  
  describe('encoder', function() {
    it('should encode', function(done) {
      stream(new Buffer([ 0xff, 1, 2, 0, 255, 0, 33, 10, 56, 22 ]))
        .pipe(pics.decode())
        .pipe(pics.encode('image/fake'))
        .pipe(cs(function(data) {
          assert.deepEqual(data, new Buffer([ 255, 0, 33, 10, 56, 22 ]));
          done();
        }));
    });
    
    it('should error if encoder doesn\'t exist', function() {
      assert.throws(function() {
        pics.encode('image/unknown');
      }, /Unsupported image encoder/);
    });
    
    it('should convert color spaces', function(done) {
      stream(new Buffer([ 0xff, 1, 2, 0, 255, 0, 33, 10, 56, 22 ]))
        .pipe(pics.decode())
        .pipe(new ColorTransform('rgba'))
        .pipe(pics.encode('image/fake'))
        .pipe(cs(function(data) {
          assert.deepEqual(data, new Buffer([ 255, 0, 33, 10, 56, 22 ]));
          done();
        }));
    });
    
    it('should convert color spaces using alpha if possible', function(done) {
      var e;
      stream(new Buffer([ 0xff, 1, 2, 0, 255, 0, 33, 10, 56, 22 ]))
        .pipe(pics.decode())
        .pipe(new ColorTransform('rgba'))
        .pipe(e = pics.encode('image/fake', ['gray', 'graya', 'cmyk']))
        .pipe(cs(function(data) {
          assert.equal(e._output.format.colorSpace, 'graya');
          assert.deepEqual(data, new Buffer([ 56, 255, 43, 255 ]));
          done();
        }));
    });
    
    it('should convert color spaces using alpha if possible (part 2)', function(done) {
      var e;
      stream(new Buffer([ 0xff, 1, 2, 0, 255, 0, 33, 10, 56, 22 ]))
        .pipe(pics.decode())
        .pipe(new ColorTransform('rgba'))
        .pipe(e = pics.encode('image/fake', ['graya', 'gray', 'cmyk']))
        .pipe(cs(function(data) {
          assert.equal(e._output.format.colorSpace, 'graya');
          assert.deepEqual(data, new Buffer([ 56, 255, 43, 255 ]));
          done();
        }));
    });
    
    it('should default to supporting rgb if not supportedColorSpaces', function(done) {
      var e;
      stream(new Buffer([ 0xff, 1, 2, 0, 255, 0, 33, 10, 56, 22 ]))
        .pipe(pics.decode())
        .pipe(new ColorTransform('rgba'))
        .pipe(e = pics.encode('image/fake', null))
        .pipe(cs(function(data) {
          assert.equal(e._output.format.colorSpace, 'rgb');
          assert.deepEqual(data, new Buffer([ 255, 0, 33, 10, 56, 22 ]));
          done();
        }));
    });
    
    it('should quantize if using indexed color space', function(done) {      
      stream(new Buffer([ 0xff, 1, 2, 0, 255, 0, 33, 10, 56, 22 ]))
        .pipe(pics.decode())
        .pipe(pics.encode('image/fake', ['indexed']))
        .pipe(cs(function(data) {
          assert.equal(data.length, 2);
          done();
        }));
    });
  });
});
