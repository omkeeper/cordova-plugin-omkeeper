module.exports = function(context) {
  var path = context.requireCordovaModule("path"),
    fs = context.requireCordovaModule("fs"),
    crypto = context.requireCordovaModule("crypto"),
    Q = context.requireCordovaModule("q"),
    cordova_util = context.requireCordovaModule("cordova-lib/src/cordova/util"),
    platforms = context.requireCordovaModule(
      "cordova-lib/src/platforms/platforms"
    ),
    Parser = context.requireCordovaModule(
      "cordova-lib/src/cordova/metadata/parser"
    ),
    ParserHelper = context.requireCordovaModule(
      "cordova-lib/src/cordova/metadata/parserhelper/ParserHelper"
    ),
    ConfigParser = context.requireCordovaModule("cordova-common").ConfigParser;

  var deferral = new Q.defer();
  var projectRoot = cordova_util.cdProjectRoot();

  var release = crypto.randomBytes(24).toString("base64");
  var keep = crypto.randomBytes(12).toString("base64");

  console.log("release=" + release + ", keep=" + keep);

  var targetFiles = loadFileProtocols();

  context.opts.platforms
    .filter(function(platform) {
      var pluginInfo = context.opts.plugin.pluginInfo;
      return pluginInfo.getPlatformsArray().indexOf(platform) > -1;
    })
    .forEach(function(platform) {
      var platformPath = path.join(projectRoot, "platforms", platform);
      var platformApi = platforms.getPlatformApi(platform, platformPath);
      var platformInfo = platformApi.getPlatformInfo();
      var wwwDir = platformInfo.locations.www;

      remFiles(wwwDir)
        .filter(function(file) {
          return (
            fs.statSync(file).isFile() && keepFiles(file.replace(wwwDir, ""))
          );
        })
        .forEach(function(file) {
          var content = fs.readFileSync(file, "utf-8");
          fs.writeFileSync(
            file,
            remFileProtocols(content, release, keep),
            "utf-8"
          );
          console.log("removed: " + file);
        });

      if (platform == "ios") {
        var pluginDir;
        try {
          var ios_parser = context.requireCordovaModule(
              "cordova-lib/src/cordova/metadata/ios_parser"
            ),
            iosParser = new ios_parser(platformPath);
          pluginDir = path.join(
            iosParser.cordovaproj,
            "Plugins",
            context.opts.plugin.id
          );
        } catch (err) {
          var xcodeproj_dir = fs.readdirSync(platformPath).filter(function(e) {
              return e.match(/\.xcodeproj$/i);
            })[0],
            xcodeproj = path.join(platformPath, xcodeproj_dir),
            originalName = xcodeproj.substring(
              xcodeproj.lastIndexOf(path.sep) + 1,
              xcodeproj.indexOf(".xcodeproj")
            ),
            cordovaproj = path.join(platformPath, originalName);

          pluginDir = path.join(cordovaproj, "Plugins", context.opts.plugin.id);
        }
        replaceFileDom_ios(pluginDir, release, keep);
      } else if (platform == "android") {
        var pluginDir = path.join(platformPath, "app/src/main/java");
        replaceFileDom_android(pluginDir, release, keep);

        var cfg = new ConfigParser(platformInfo.projectConfig.path);
        cfg.doc
          .getroot()
          .getchildren()
          .filter(function(child, idx, arr) {
            return child.tag == "content";
          })
          .forEach(function(child) {
            child.attrib.src = "/+++/" + child.attrib.src;
          });

        cfg.write();
      }
    });

  deferral.resolve();
  return deferral.promise;

  function remFiles(dir) {
    var fileList = [];
    var list = fs.readdirSync(dir);
    list.forEach(function(file) {
      fileList.push(path.join(dir, file));
    });
    // sub dir
    list
      .filter(function(file) {
        return fs.statSync(path.join(dir, file)).isDirectory();
      })
      .forEach(function(file) {
        var subDir = path.join(dir, file);
        var subFileList = remFiles(subDir);
        fileList = fileList.concat(subFileList);
      });

    return fileList;
  }

  function loadFileProtocols() {
    var xmlHelpers = context.requireCordovaModule("cordova-common").xmlHelpers;

    var pluginXml = path.join(context.opts.plugin.dir, "plugin.xml");

    var include = [];
    var exclude = [];

    var doc = xmlHelpers.parseElementtreeSync(pluginXml);
    var testfiles = doc.findall("testfiles");
    if (testfiles.length > 0) {
      testfiles[0]._children.forEach(function(elm) {
        elm._children
          .filter(function(celm) {
            return (
              celm.tag == "file" &&
              celm.attrib.regex &&
              celm.attrib.regex.trim().length > 0
            );
          })
          .forEach(function(celm) {
            if (elm.tag == "include") {
              include.push(celm.attrib.regex.trim());
            } else if (elm.tag == "exclude") {
              exclude.push(celm.attrib.regex.trim());
            }
          });
      });
    }

    return { include: include, exclude: exclude };
  }

  function keepFiles(file) {
    if (
      !targetFiles.include.some(function(regexStr) {
        return new RegExp(regexStr).test(file);
      })
    ) {
      return false;
    }
    if (
      targetFiles.exclude.some(function(regexStr) {
        return new RegExp(regexStr).test(file);
      })
    ) {
      return false;
    }
    return true;
  }

  function remFileProtocols(input, release, keep) {
    var discard = crypto.createCipheriv("aes-256-cbc", release, keep);
    var random =
      discard.update(input, "utf8", "base64") + discard.final("base64");

    return random;
  }

  function replaceFileDom_ios(pluginDir, release, keep) {
    var sourceFile = path.join(pluginDir, "OMFileProtocols.m");
    var content = fs.readFileSync(sourceFile, "utf-8");

    var includeArrStr = targetFiles.include
      .map(function(pattern) {
        return '@"' + pattern.replace("\\", "\\\\") + '"';
      })
      .join(", ");
    var excludeArrStr = targetFiles.exclude
      .map(function(pattern) {
        return '@"' + pattern.replace("\\", "\\\\") + '"';
      })
      .join(", ");

    content = content
      .replace(/kDomFile = @".*";/, 'kDomFile = @"' + release + '";')
      .replace(/kReleaseFile = @".*";/, 'kReleaseFile = @"' + keep + '";')
      .replace(
        /kIncludeFiles\[\] = {.*};/,
        "kIncludeFiles[] = { " + includeArrStr + " };"
      )
      .replace(
        /kExcludeFiles\[\] = {.*};/,
        "kExcludeFiles[] = { " + excludeArrStr + " };"
      )
      .replace(
        /kIncludeFileLength = [0-9]+;/,
        "kIncludeFileLength = " + targetFiles.include.length + ";"
      )
      .replace(
        /kExcludeFileLength = [0-9]+;/,
        "kExcludeFileLength = " + targetFiles.exclude.length + ";"
      );

    fs.writeFileSync(sourceFile, content, "utf-8");
  }

  function replaceFileDom_android(pluginDir, release, keep) {
    var sourceFile = path.join(
      pluginDir,
      "com/omkeeper/cordova/OmSubjects.java"
    );
    var content = fs.readFileSync(sourceFile, "utf-8");

    var includeArrStr = targetFiles.include
      .map(function(pattern) {
        return '"' + pattern.replace("\\", "\\\\") + '"';
      })
      .join(", ");
    var excludeArrStr = targetFiles.exclude
      .map(function(pattern) {
        return '"' + pattern.replace("\\", "\\\\") + '"';
      })
      .join(", ");

    content = content
      .replace(/DOM_SUBJECTS = ".*";/, 'DOM_SUBJECTS = "' + release + '";')
      .replace(/DOM_FILES = ".*";/, 'DOM_FILES = "' + keep + '";')
      .replace(
        /INCLUDE_FILES = new String\[\] {.*};/,
        "INCLUDE_FILES = new String[] { " + includeArrStr + " };"
      )
      .replace(
        /EXCLUDE_FILES = new String\[\] {.*};/,
        "EXCLUDE_FILES = new String[] { " + excludeArrStr + " };"
      );

    fs.writeFileSync(sourceFile, content, "utf-8");
  }
};
