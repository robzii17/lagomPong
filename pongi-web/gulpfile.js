'use strict';

var appName = 'pong';

var gulp = require('gulp');
var plugins = require('gulp-load-plugins')();
var del = require('del');
var express = require('express');
var path = require('path');
var open = require('open');
var stylish = require('jshint-stylish');
var connectLr = require('connect-livereload');
var streamqueue = require('streamqueue');
var runSequence = require('run-sequence');
var merge = require('merge-stream');
var ripple = require('ripple-emulator');
var rewrite = require('express-urlrewrite');
var proxyMiddleware = require('http-proxy-middleware');
var less = require('gulp-less');
var sourcemaps = require('gulp-sourcemaps');


/**
 * Parse arguments
 */
var args = require('yargs')
    .alias('e', 'emulate')
    .alias('b', 'build')
    .alias('r', 'run')
    // remove all debug messages (console.logs, alerts etc) from release build
    .alias('release', 'strip-debug')
    .default('build', false)
    .default('port', 9001)
    .default('strip-debug', false)
    .argv;

var build = !!(args.build || args.emulate || args.run);
var emulate = args.emulate;
var run = args.run;
var port = args.port;
var stripDebug = !!args.stripDebug;
var targetDir = path.resolve(build ? 'www' : '.tmp');
var fullJS = args.full;


// global error handler
var errorHandler = function(error) {
    if (build) {
        throw error;
    } else {
        beep(2, 170);
        plugins.util.log(error);
    }
};


var context = '/api';
var options = {
    target: 'http://localhost:9000', // target host
    changeOrigin: true,               // needed for virtual hosted sites
    ws: true,                         // proxy websockets

    proxyTable: {
        'localhost:9001' : 'http://localhost:9000'
    },
    onError : function(err, req, res ) {
        res.end('Something went wrong:' + err);
    }

};

// create the proxy
var proxy = proxyMiddleware(context, options);


// clean target dir
gulp.task('clean', function(done) {
    del([targetDir], done);
});




gulp.task('less', function () {
    return gulp.src('app/less/**/*.less')
        .pipe(sourcemaps.init())
        .pipe(less({
            paths: [ path.join(__dirname, 'less', 'includes') ]
        }))
        .pipe(sourcemaps.write())
        .pipe(gulp.dest('./.tmp/styles'));
});


gulp.task('scripts', function() {
    var dest = path.join(targetDir, 'scripts');

    var minifyConfig = {
        collapseWhitespace: true,
        collapseBooleanAttributes: true,
        removeAttributeQuotes: true,
        removeComments: true
    };


    var scriptStream = gulp
        .src([ 'app.js', '**/*.js'], { cwd: 'app/scripts' })

        .pipe(plugins.if(!build, plugins.changed(dest)));

    return streamqueue({ objectMode: true }, scriptStream)
        .pipe(plugins.if(build, plugins.ngAnnotate()))
        .pipe(plugins.if(stripDebug, plugins.stripDebug()))
        .pipe(plugins.if(build, plugins.concat('app.js')))
        .pipe(plugins.if(build, plugins.uglify()))
        .pipe(plugins.if(build && !emulate, plugins.rev()))

        .pipe(gulp.dest(dest))

        .on('error', errorHandler);
});

gulp.task('scalajs', function() {
    var dest = path.join(targetDir, 'scjs');
    return gulp.src(['./target/scala-2.12/*.js','./target/scala-2.12/*.js.map'])
        .pipe( gulp.dest(dest));

});

gulp.task('resources', function() {
    var dest = path.join(targetDir, 'resources');
    return gulp.src(['./target/scala-2.12/classes/**/*.json'])
        .pipe( gulp.dest(dest));

});




// copy images
gulp.task('images', function() {
    return gulp.src('app/images/**/*.*')
        .pipe(gulp.dest(path.join(targetDir, 'images')))
        .on('error', errorHandler);
});



// concatenate and minify vendor sources
gulp.task('vendor', function() {
    var vendorFiles = require('./vendor.json');

    return gulp.src(vendorFiles)
        .pipe(plugins.concat('vendor.js'))
        .pipe(plugins.if(build, plugins.uglify()))
        .pipe(plugins.if(build, plugins.rev()))
        .pipe(gulp.dest(targetDir))
        .on('error', errorHandler);
});


// inject the files in index.html
gulp.task('index', [ 'scripts'], function() {

    var lesscssNaming = 'stylesl/main*';
    // injects 'src' into index.html at position 'tag'
    var _inject = function(src, tag) {
        return plugins.inject(src, {
            starttag: '<!-- inject:' + tag + ':{{ext}} -->',
            read: false,
            addRootSlash: false
        });
    };

    // get all our javascript sources
    // in development mode, it's better to add each file seperately.
    // it makes debugging easier.
    var _getAllScriptSources = function() {
        var scriptStream = gulp.src(['scripts/app.js', 'scripts/**/*.js'], { cwd: targetDir });
        return streamqueue({ objectMode: true }, scriptStream);
    };

    return gulp.src('app/index.html')
    // inject css
    //.pipe(_inject(gulp.src(cssNaming, { cwd: targetDir }), 'app-styles'))
        .pipe(_inject(gulp.src(lesscssNaming, { cwd: targetDir }), 'app-stylesless'))
        // inject vendor.js
        .pipe(_inject(gulp.src('vendor*.js', { cwd: targetDir }), 'vendor'))
        // inject app.js (build) or all js files indivually (dev)
        // inject scala.js
        .pipe(_inject(gulp.src([fullJS ? 'scjs/'+appName+'-jsdeps.min.js' :
            'scjs/'+appName+'-jsdeps.js' , fullJS ? 'scjs/'+appName+'-opt.js'
            : 'scjs/'+appName+'-fastopt.js','scjs/'+appName+'-launcher.js'], { cwd: targetDir }), 'scalajs'))
        .pipe(plugins.if(build,
            _inject(gulp.src('scripts/app*.js', { cwd: targetDir }), 'app'),
            _inject(_getAllScriptSources(), 'app')
        ))

        .pipe(gulp.dest(targetDir))
        .on('error', errorHandler);
});

// start local express server
gulp.task('serve', function() {
    express()
        .use(!build ? connectLr() : function(){})
        .use(rewrite(/^\/vidi\/.*\.html$/, '/index.html'))
        .use(rewrite(/^\/vidi\/(.*)$/, '/$1'))
        .use(proxy)

        .use(express.static(targetDir))
        .listen(port);
    open('http://localhost:' + port + '/');
});


// ripple emulator
gulp.task('ripple', ['scripts', 'less', 'watchers'], function() {

    var options = {
        keepAlive: false,
        open: true,
        port: 4400
    };

    // Start the ripple server
    ripple.emulate.start(options);

    open('http://localhost:' + options.port + '?enableripple=true');
});


// start watchers
gulp.task('watchers', function() {
    plugins.livereload.listen();
//  gulp.watch('app/styles/**/*.scss', ['styles']);
    gulp.watch('app/less/**/*.less', ['less']);
    gulp.watch('app/icons/**', ['iconfont']);
    gulp.watch('app/images/**', ['images']);
    gulp.watch('app/scripts/**/*.js', ['index']);
    gulp.watch('./vendor.json', ['vendor']);
    gulp.watch('app/templates/**/*.html', ['index']);
    gulp.watch('app/index.html', ['index']);
    gulp.watch('./target/scala-2.12/*.js', ['scalajs']);
    gulp.watch('./target/scala-2.12/classes/**/*.json', ['resources']);
    gulp.watch(targetDir + '/**')
        .on('change', plugins.livereload.changed)
        .on('error', errorHandler);
});

// no-op = empty function
gulp.task('noop', function() {});

// our main sequence, with some conditional jobs depending on params
gulp.task('default', function(done) {
    runSequence(
        'clean',
        [
            'less',
            'images',
            'vendor',
            'scalajs',
            'resources',
            'index'
        ],
        'index',
        build ? 'noop' : 'watchers',
        build ? 'noop' : 'serve',
        emulate ? ['ionic:emulate', 'watchers'] : 'noop',
        run ? 'ionic:run' : 'noop',
        done);
});


gulp.task('build', function() {
    runSequence(
        'clean',
        [
            'less',
            'images',
            'vendor',
            'scalajs'
        ],
        'index');
});

