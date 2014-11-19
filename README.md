# pics

Ties together streaming image encoders and decoders with a nice API. It handles the following concerns:

1. Probing images for their file format on the first chunk and proxying to the correct decoder.
2. Finding and initializing image encoders based on mime type.
3. Performing the necessary color conversions to encode an image, depending on the supported color spaces
    of the image format. This includes quantization in the case of indexed image formats such as GIF.

## Installation

    npm install pics

## Example

The following example registers some image codec plugins, and converts a PNG to a JPEG.

```javascript
var pics = require('pics');

// register some image codecs
pics.use(require('gif-stream'));
pics.use(require('jpg-stream'));
pics.use(require('png-stream'));

// convert a PNG to a JPEG
fs.createReadStream('in.png')
  .pipe(pics.decode())
  .pipe(pics.encode('image/jpeg'))
  .pipe(fs.createWriteStream('out.jpg'));
```

Notice that nowhere is a PNG decoder explicitly created: it is created for us automatically
by probing the first few bytes of a file. You could just as easily pipe a GIF to `pics.decode()`
and convert it to a JPEG with no code modifications.

## API

### `pics.use(codec)`

Registers a image codec plugin. Should be an object with the following properties:

* `Decoder` - the image decoder class. Should be a transform stream.
* `Encoder` - the image encoder class. Should be a [pixel-stream](https://github.com/devongovett/pixel-stream).
* `mime` - the mime type for this image format.

You can register only a decoder by including only a `Decoder` property. To register only an encoder,
include the `Encoder` and `mime` properties.

The `Decoder` class should have a static `probe` method that accepts a buffer and returns a boolean
to determine whether the image format can be handled by that decoder.

The `Encoder` class should have a `supportedColorSpaces` property, which is an array listing the 
color spaces supported by this image format. Color space conversion using the 
[color-transform](https://github.com/devongovett/color-transform) and [neuquant](https://github.com/devongovett/neuquant)
modules may be performed prior to data being passed to the encoder if the input color space
is not one of the supported color spaces of this encoder.

### `pics.decode(options)`

Returns a decoder stream that probes the image to find an available decoder for the file.
The options are passed to the underlying decoder class.

### `pics.encode(mime, options)`

Returns an encoder stream for the given mime type. The options are passed to the underlying
encoder class. Depending on the input to this stream, color space conversion or quantization
may be necessary, and will be performed before the data is sent to the underlying image encoder.

## License

MIT
