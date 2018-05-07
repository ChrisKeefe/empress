//webgl vertex shader program - calculates tree coordinates in screen space
window.vertexShaderText =
[
'precision mediump float;',
'',
'attribute vec2 vertPosition;',
'attribute float alpha;',
'attribute float pSize;',
'uniform mat4 mWorld;',
'uniform mat4 mView;',
'uniform mat4 mProj;',,
'varying float alphaInt;',
'',
'void main()',
'{',
'  alphaInt = alpha;',
'  gl_Position = mProj * mView * mWorld * vec4(vertPosition, 0.0, 1.0);',
'  gl_PointSize = pSize;',
'}'
].join('\n');

//webgl fragment shader program - colors the tree
window.fragmentShaderText =
[
'precision mediump float;',
'varying float alphaInt;',
'',
'void main()',
'{',
'  gl_FragColor = vec4(0.0,0.0,0.0,alphaInt);',
'}'
].join('\n');

//global variables -- window = global
window.canvas;
window.program; //loads the vertex/fragment shader into webgl
window.gl; //webgl context - used to call webgl functions
window.largeDim; //used to normalize the tree to fit into a 1x1 square
window.result = []; //edgeMetadata extracted from dataframe
window.worldMat = mat4.create();
window.scaleFactor = 5.0 / 4.0; //how much the tree grows/shrinks during zoom

/*
 * compliles shader programs and initializes webgl
 */
function InitWebGl() {

	document.getElementById('highlight-menu').style.display = 'block';

	window.topBorder = document.getElementsByTagName("fieldset")[0];
	var canvas = document.getElementById("tree-surface");
  // var canvas = $('#tree-surface');

/* Rresize the canvas to occupy the full page,
   by getting the widow width and height and setting it to canvas*/
	canvas.width  = document.getElementById('drawing-surface').offsetWidth;
	canvas.height = document.getElementById('drawing-surface').offsetHeight;
  // canvas.width(document.getElementById('drawing-surface').offsetWidth);
  // canvas.height(document.getElementById('drawing-surface').offsetHeight);
  console.log(canvas.width);
  console.log($('#drawing-surface').width());

	console.log('init webgl');
	window.canvas = document.getElementById('tree-surface');
	window.gl = window.canvas.getContext('webgl');

	if (!window.gl) {
		console.log('WebGL not supported, falling back on experimental-webgl');
		window.gl = window.canvas.getContext('experimental-webgl');
		return;
	}

	if (!window.gl) {
		alert('Your browser does not support WebGL');
		return;
	}

	window.edgeMetadata = arguments[0];
	if(edgeMetadata === undefined) {
		console.log('edgeMetadata not empty')
		return;
	}

	extractEdges(edgeMetadata);

	var templateMetadata = edgeMetadata[0];
	var x = document.getElementById("highlight-options");
	for (var property in templateMetadata) {
    if (templateMetadata.hasOwnProperty(property)) {
	    if (!($.inArray(property, ['px', 'py', 'x', 'y', 'alpha']) >= 0)) {
	      var option = document.createElement("option");
  			option.text = property;
  			option.label = property; //TODO: check to see if property is numeric or categorical
  			x.add(option);
		  }
    }
	}
	window.gl.clearColor(0.75, 0.85, 0.8, 1.0);
	window.gl.clear(window.gl.COLOR_BUFFER_BIT | window.gl.DEPTH_BUFFER_BIT);

	//
	// Create shaders
	//
	var vertexShader = window.gl.createShader(window.gl.VERTEX_SHADER);
	var fragmentShader = window.gl.createShader(window.gl.FRAGMENT_SHADER);

	window.gl.shaderSource(vertexShader, window.vertexShaderText);
	window.gl.shaderSource(fragmentShader, window.fragmentShaderText);

	window.gl.compileShader(vertexShader);
	if (!window.gl.getShaderParameter(vertexShader, window.gl.COMPILE_STATUS)) {
		console.error('ERROR compiling vertex shader!', window.gl.getShaderInfoLog(vertexShader));
		return;
	}

	window.gl.compileShader(fragmentShader);
	if (!window.gl.getShaderParameter(fragmentShader, window.gl.COMPILE_STATUS)) {
		console.error('ERROR compiling fragment shader!', window.gl.getShaderInfoLog(fragmentShader));
		return;
	}

	window.program = window.gl.createProgram();
	window.gl.attachShader(window.program, vertexShader);
	window.gl.attachShader(window.program, fragmentShader);
	window.gl.linkProgram(window.program);
	if (!window.gl.getProgramParameter(window.program, window.gl.LINK_STATUS)) {
		console.error('ERROR linking program!', window.gl.getProgramInfoLog(window.program));
		return;
	}
	window.gl.validateProgram(window.program);
	if (!window.gl.getProgramParameter(window.program, window.gl.VALIDATE_STATUS)) {
		console.error('ERROR validating program!', window.gl.getProgramInfoLog(window.program));
		return;
	}

	window.gl.useProgram(window.program);
	var treeVertexBufferObject = window.gl.createBuffer();
	window.gl.bindBuffer(window.gl.ARRAY_BUFFER, treeVertexBufferObject);
	window.gl.bufferData(window.gl.ARRAY_BUFFER, new Float32Array(window.result), window.gl.DYNAMIC_DRAW);
	//window.gl.bufferData(window.gl.ARRAY_BUFFER, null, window.gl.DYNAMIC_DRAW);
	//window.gl.bufferSubData(window.gl.ARRAY_BUFFER,0,new Float32Array(window.result));

	var positionAttribLocation = window.gl.getAttribLocation(window.program, 'vertPosition');
	var alphaAttribLocation = window.gl.getAttribLocation(window.program, 'alpha');
	window.gl.vertexAttribPointer(
		positionAttribLocation, // Attribute location
		2, // Number of elements per attribute
		window.gl.FLOAT, // Type of elements
		window.gl.FALSE,
		3 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
		0 // Offset from the beginning of a single vertex to this attribute
	);
	window.gl.vertexAttribPointer(
		alphaAttribLocation, // Attribute location
		1, // Number of elements per attribute
		window.gl.FLOAT, // Type of elements
		window.gl.FALSE,
		3 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
		2 * Float32Array.BYTES_PER_ELEMENT // Offset from the beginning of a single vertex to this attribute
	);

	window.gl.enableVertexAttribArray(positionAttribLocation);
	gl.enableVertexAttribArray(alphaAttribLocation);
	console.log('finish init webgl');
	initCallbacks();
	draw();
};

/*
 * Extracts the coordinates of the tree from edge_metadata
 */
function extractEdges(edgeMeta) {
	var minX = Infinity;
	var maxX = -Infinity;
	var minY = Infinity;
	var maxY = -Infinity;
	window.result = [];
	window.edgeMetadata = edgeMeta;
	for(i = 0; i < window.edgeMetadata.length; i++){
		//console.log(edgeMetadata[i].px);
		if(window.edgeMetadata[i].x > maxX){
			maxX =  window.edgeMetadata[i].x;
		}
		if(window.edgeMetadata[i].y > maxY){
			maxY =  window.edgeMetadata[i].y;
		}
		if(window.edgeMetadata[i].x < minX){
			minX =  window.edgeMetadata[i].x;
		}
		if(window.edgeMetadata[i].y < minY){
			minY =  window.edgeMetadata[i].y;
		}
		window.result.push(window.edgeMetadata[i].px);
		window.result.push(window.edgeMetadata[i].py);
		window.result.push(window.edgeMetadata[i].alpha);
		window.result.push(window.edgeMetadata[i].x);
		window.result.push(window.edgeMetadata[i].y);
		window.result.push(window.edgeMetadata[i].alpha);
	}

	var xDim = Math.abs(maxX - minX);
	var yDim = Math.abs(maxY - minY);
	if(xDim > yDim) {
		window.largeDim = xDim;
	}
	else{
		window.largeDim = yDim;
	}
}
