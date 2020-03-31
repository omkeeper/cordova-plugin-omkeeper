# OMKeeper plugin

Keep or Release Files

### Default

- .html
- .htm
- .js
- .css

### Release files

You can specify the release files by editing `plugin.xml`.

**plugins/cordova-plugin-omkeeper/plugin.xml**

```
<testfiles>
    <include>
        <file regex="\.(htm|html|js|css)$" />
    </include>
    <exclude>
        <file regex="exclude_file\.js$" />
    </exclude>
</testfiles>
```

Specify the target file as a regular expression.

## Supported platforms

- Android

## License

Apache version 2.0
