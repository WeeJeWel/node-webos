# node-webos
webOS client for LG TVs

Largely inspired by [https://github.com/msloth/lgtv.js](https://github.com/msloth/lgtv.js). Thanks for all the hard work!

## Examples
### Scanning for a TV

```javascript
var Scanner = require('webos').Scanner;
var scanner = new Scanner();

scanner.startScanning();
scanner.on('device', function(device){
	console.log('device', device)
	
	scanner.stopScanning();
	
})
```

### Sending commands to a TV

```javascript
var Remote = require('webos').Remote;
var remote = new Remote();

// If you don't provide `key`, the TV will show a pairing dialog. When pressed OK, the callback's 2nd parameter will be your new key.
remote.connect({
	address	: process.argv[2] || '192.168.0.109',
	key		: process.argv[3] || '4d5b7754bb3cc6475ffb3ca09a14dee9'
}, function( err, key ){
	if( err ) return console.error('Error', err);
	
	console.log('------- showing float --------');
	remote.showFloat( "Test", function( err, result ){
		if( err ) return console.error('Error', err);
		
		console.log("You should've seen 'Test'")	
		
		console.log('------- getting channels --------');
		remote.getChannels(function( err, channels ){
			if( err ) return console.error('Error', err);	
		
			console.log('got %s channels', channels.length)
			console.log('channel #1:', channels[0]);
			
			console.log('------- disconnecting --------');
			remote.disconnect(function( err, disconnected ){
				if( err ) return console.error('Error', err);
				console.log('Disconnected');			
			});
		})
	})
})
```

## Todo
* Input methods (keyboard + pointer)
* Open a YouTube video instantly

# License
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International](http://creativecommons.org/licenses/by-nc-sa/4.0/)
