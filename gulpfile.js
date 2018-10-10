/**
 * Dependencies
 */
const gulp = require('gulp');
const watch = require('gulp-watch');
const path = require('path');
const autoprefixer = require('gulp-autoprefixer');
const cleanCSS = require('gulp-clean-css');
const uglify = require('gulp-uglify');
const concat = require('gulp-concat');
const argv = require('yargs').argv;
const sass = require('gulp-sass');
const extend = require('extend');
const sourcemaps = require('gulp-sourcemaps');
const browserSync = require('browser-sync').create();
const rename = require('gulp-rename');
const fs = require('fs');
const notifier = require('node-notifier');
const babel = require('gulp-babel');


/**
 * Environment
 */
var environmentPath;
var environment;


var notify = function(content, log)
{
    if (typeof log == 'undefined') {
        console.log(content);
    }

    notifier.notify({
        title: argv.e,
        message: content
    });
}


/**
 * Tasks
 * @type {Object}
 */
var tasks = {
    /**
     * Définit l'environnement à utiliser
     * @return boolean true si l'environnement est trouvé, false sinon
     */
    defineEnvironment: function()
    {
        environmentPath = '../' + argv.e + '/';
        var configurationFilePath = environmentPath + 'gulp/gulp.conf.json';
        var localConfigurationFilePath = environmentPath + 'gulp/gulp.conf.local.json';

        var configuration = JSON.parse(fs.readFileSync(configurationFilePath));
        var localConfiguration = JSON.parse(fs.readFileSync(localConfigurationFilePath));

        environment = extend({}, configuration, localConfiguration);

        for (var pathIndex in environment.paths) {
            environment.paths[pathIndex] = tasks.environmentPathPrefix(
                environment.paths[pathIndex]);
        }

        if (environment.javascriptsGroups) {
            var tmp = environment.javascriptsGroups;
            environment.javascriptsGroups = {};

            for (var pathGroupIndex in tmp) {
                environment.javascriptsGroups[tasks.environmentPathPrefix(
                    pathGroupIndex)] = [];

                for (var pathIndex in tmp[pathGroupIndex]) {
                    environment.javascriptsGroups[tasks.environmentPathPrefix(
                            pathGroupIndex)]
                        .push(tasks.environmentPathPrefix(tmp[
                            pathGroupIndex][pathIndex]));
                }
            }
        }
    },

    /**
     * Modification d'un fichier détectée
     * @param  {object} event L'évènement lié
     * @return null
     */
    serverChanged: function(event)
    {
        tasks.defineEnvironment();
        var filePath = event.path;
        var pipe = undefined;
        console.log('[MODIFIED] ' + filePath);

        // SCSS
        if (environment.scss && tasks.scss.isScssFilepath(filePath)) {
            var configurations = tasks.getGroupPathConfigurations('stylesheetsGroups', filePath);

            if (configurations.length > 0) {
                for (var configurationIndex in configurations) {
                    var configuration = configurations[configurationIndex];

                    filePath = tasks.environmentPathPrefix(configuration.parent);
                    var destination = tasks.environmentPathPrefix(configuration.destination);

                    pipe = tasks.scss.compile(filePath, destination);
                    pipe.pipe(browserSync.stream());
                    console.log('[COMPILED] ' + filePath + ' > ' + destination);
                }
            } else {
                notify('Configuration manquante pour le fichier ' + filePath);
            }

        // JS
        } else if (environment.js && tasks.js.isJsFilepath(filePath) && !tasks.js.isMinifiedJsFile(filePath)) {
            var mainFilePaths = tasks.getRootGroupPaths('javascriptsGroups', filePath);

            if (mainFilePaths.length > 0) {
                for (var mainFilePathIndex in mainFilePaths) {
                    var mainFilePath = mainFilePaths[mainFilePathIndex];
                    filePath = tasks.environmentPathPrefix(mainFilePath);
                    var filePaths = environment.javascriptsGroups[mainFilePath];

                    pipe = tasks.js.compile(filePath, filePaths);
                    pipe.pipe(browserSync.stream());
                    console.log('[COMPILED] ' + filePath);
                }
            } else {
                notify('Configuration manquante pour le fichier ' + filePath);
            }
        }
    },

    getGroupPathConfigurations: function(group, filePath)
    {
        var configurations = [];

        if (typeof environment[group] !== 'undefined') {
            for (var groupItemIndex in environment[group]) {
                for (var index in environment[group][groupItemIndex].files) {
                    var subFilePath = environment[group][groupItemIndex].files[index];

                    subFilePath = tasks.environmentPathPrefix(subFilePath, true);

                    if (subFilePath == filePath) {
                        configurations.push(environment[group][groupItemIndex]);
                    }
                }
            }
        }

        return configurations;
    },

    getRootGroupPaths: function(group, filePath)
    {
        var paths = [];

        if (typeof environment[group] !== 'undefined') {
            for (var mainFilePath in environment[group]) {
                for (var index in environment[group][mainFilePath]) {
                    var subFilePath = environment[group][mainFilePath][index];
                    subFilePath = tasks.environmentPathPrefix(subFilePath, true);

                    if (subFilePath == filePath) {
                        paths.push(mainFilePath);
                    }
                }
            }
        }

        return paths;
    },

    environmentPathPrefix: function(filePath, absolute)
    {
        filePath = environmentPath + filePath;

        if (absolute === true) {
            filePath = path.resolve(filePath);
        }

        return filePath;
    },

    /**
     * Méthodes pour gérer les fichiers SCSS
     * @type {Object}
     */
    scss: {
        /**
         * Détecte si le fichier est un fichier SCSS
         * @param  {string}  filePath Le chemin vers le fichier
         * @return {Boolean}          true si le fichier est un fichier SCSS, false sinon
         */
        isScssFilepath: function(filePath)
        {
            return path.extname(filePath) == '.scss';
        },

        /**
         * Compile le fichier SCSS en CSS et le sauvegarde dans le même dossier avec le même nom, mais l'extension .css
         * @param  {[type]} filePath Le chemin du fichier SCSS à traiter
         * @return {[type]}          null
         */
        compile: function(filePath, destination)
        {
            var dirPath = path.dirname(destination);

            return gulp
                .src(filePath)
                .pipe(sourcemaps.init())
                .pipe(
                    sass()
                    .on('error', function(error){
                        notify(error.formatted, false);
                        sass.logError.bind(this)(error);
                    })
                )
                .pipe(cleanCSS(environment.options.cleanCSS))
                .pipe(autoprefixer(['last 20 versions', 'Firefox >= 20']))
                .pipe(sourcemaps.write())
                .pipe(rename(path.basename(destination)))
                .pipe(gulp.dest(dirPath));
        }
    },

    /**
     * Méthodes pour gérer les fichiers JS
     * @type {Object}
     */
    js: {
        /**
         * Détecte si le fichier est un fichier JS
         * @param  {string}  filePath Le chemin vers le fichier
         * @return {Boolean}          true si le fichier est un fichier JS, false sinon
         */
        isJsFilepath: function(filePath)
        {
            return path.extname(filePath) == '.js';
        },

        /**
         * Détecte si le fichier est un fichier JS minifié
         * @param  {string}  filePath Le chemin vers le fichier
         * @return {Boolean}          true si le fichier est un fichier JS minifié, false sinon
         */
        isMinifiedJsFile: function(filePath) 
        {
            return path.basename(filePath).indexOf('.min.js') > -1;
        },

        /**
         * Minifie le fichier JS
         * @param  {[type]} filePath Le chemin du fichier JS à traiter
         * @return {[type]}          null
         */
        compile: function(filePath, filePaths)
        {
            var dirPath = path.dirname(filePath);
            var basename = path.basename(filePath, '.js');
            var outputFilePath = basename + '.min.js';

            if (typeof filePaths != 'undefined' && filePaths.length > 0) {
                return gulp.src(filePaths)
                    .pipe(concat(outputFilePath))
                    .pipe(sourcemaps.init())
                    .pipe(babel())
                    .pipe(
                        uglify(outputFilePath)
                            .on('error', function(error){
                                console.log(error);
                                notify(error.cause.message + '(' + error.fileName + ')', false);
                            })
                    )
                    .pipe(sourcemaps.write('.'))
                    .pipe(gulp.dest(dirPath));
            }
        }
    },

    /**
     * Écoute les fichiers définis pour l'environnement spécifié dans la commande
     * (paramètre -e, ex: gulp watch -e wda)
     * @return null
     */
    watch: function()
    {
        tasks.defineEnvironment();

        if (environment.browserSync) {
            console.log({
                proxy: environment.host,
                browser: environment.browser
            });
            browserSync.init({
                proxy: environment.host,
                browser: environment.browser
            });
        }

        console.log('Watching files : ' + environment.paths.join(', '));

        try {
            watch(environment.paths, tasks.serverChanged);
        } catch (exception) {
            console.log(exception);
        }
    },

    buildJS : function()
    {
        tasks.defineEnvironment();

        for (var mainFile in environment.javascriptsGroups) {
            tasks.buildFromPath(environment.javascriptsGroups[mainFile][0]);
        }
    },

    buildCSS : function()
    {
        tasks.defineEnvironment();

        for (var index in environment.stylesheetsGroups) {
            tasks.buildFromPath(environment.stylesheetsGroups[index].files[0]);
        }
    },

    build : function()
    {
        tasks.defineEnvironment();
        tasks.buildJS();
        tasks.buildCSS();
    },

    buildFromPath : function(filePath)
    {
        tasks.serverChanged({
            path: tasks.environmentPathPrefix(filePath, true)
        });
    }
};

/**
 * Gulp Tasks (gulp <task> -e <environment>)
 */

gulp.task('watch', tasks.watch);
gulp.task('build', tasks.build);
gulp.task('build-js', tasks.buildJS);
gulp.task('build-css', tasks.buildCSS);
