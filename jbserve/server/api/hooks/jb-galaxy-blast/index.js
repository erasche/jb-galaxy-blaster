/* 
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
var request = require('request');
//var prettyjson = require('prettyjson');   // for debugging
var fs = require('fs');
var path = require('path');

//var filePath = "/var/www/html/jb-galaxy-blaster/tmp/";
//var urlPath = "http://localhost/jb-galaxy-blaster/tmp/";

var globalPath = "/etc/jbrowse";
var globalFile = globalPath + "/globals.dat";


module.exports = function (sails) {

   return {

        initialize: function(cb) {
           console.log("Sails Hook: jb-galaxy-blast initialize"); 
           // todo: check that galaxy is running
           
           return cb();
        },
        routes: {
           after: {
              'post /jbapi/blastregion': rest_BlastRegion,
              'post /jbapi/workflowsubmit': rest_WorkflowSubmit,

              'post /jbapi/posttest': function (req, res, next) {
                  console.log("jb-galaxy-blast /jbapi/posttest called");
                  res.header("Access-Control-Allow-Origin", "*");
                  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
                  res.send(req.body);
              },
              'get /jbapi/test': function (req, res, next) {
                  console.log("jb-galaxy-blast /jbapi/gettest called");
                  res.send({result:"jb-galaxy-blast gettest success"});
                  //return next();
              }
              
           }
        }

    }
};

function rest_WorkflowSubmit(req,res) {
    var g = sails.config.globals;
    var region = req.body.region;
    var workflow = req.body.workflow;
    
    var params = {
        //workflow_id: 'f2db41e1fa331b3e',
        workflow_id: workflow,
        history: 'hist_id=f597429621d6eb2b',
        ds_map: {
            "0": {
                src: 'hda',
                id: 'test.out'//result.outputs[0].id
            }
        }
    };
    
    console.log("params",params);
    var jsonstr = JSON.stringify(params);

    var d = new Date();

    // write the BLAST region file
    
    var theBlastFile = "blast_region"+d.getTime()+".fa";
    
    // write the received region into a file
    // todo: handle errors
    ws = fs.createWriteStream(g.jbrowse.filePath+theBlastFile);
    ws.write(region);
    ws.end();
    

    // write variable to global
    // todo: later the name and perhaps additional info should come from the FASTA header (ie: JBlast ctgA ctgA:46990..48410 (- strand)
    // which should appear as the track name when the operation is done.
    var blastData = {
            "name": "JBlast", 
            //"blastSeq": "/var/www/html/jb-galaxy-blaster/tmp/44705works.fasta",
            "blastSeq": g.jbrowse.filePath+theBlastFile,
            "originalSeq": "/var/www/html/jb-galaxy-blaster/tmp/volvox.fa",
            "offset": 44705
    };
    storeInGlobals(blastData,"jblast");
   
    console.log("blastData",blastData);
    
    
    request.post({
        url: g.jbrowse.galaxyUrl+"/api/workflows"+"?key="+g.jbrowse.galaxyAPIKey, 
        method: 'POST',
        //qs: params,
        headers: {
            'Accept-Encoding' : 'gzip, deflate',
            'Accept-Language' : 'en-US,en;q=0.5',
            'Content-Length' : jsonstr.length
        },
        json: params
    }, function(error, response, body){
        if(error) {
            console.log(error);
        } else {
            //console.log(response.statusCode, body);
            //JSON.stringify(eval("(" + str + ")"));
            //var result = JSON.parse(body);
            var result = body;
            console.log(result);
        }
    });    
    
}

// store section in globals
function storeInGlobals (sectionData,sectionName) {
    
    fs.readFile(globalFile, function read(err, data) {
        if (err) {
            throw err;
        }
        var g = JSON.parse(data);
        g[sectionName] = sectionData;

        var gStr = JSON.stringify(g,null,4);

        fs.writeFile(globalFile,gStr, function (err) {
            if (err) throw err;
            console.log("Global file: "+ globalFile);
        });
    });    
        
}


// REST function for /jbapi/blastregion
function rest_BlastRegion(req,res) {

    var g = sails.config.globals;
    var region = req.body.region;
    
    //console.dir(req.body);
    
    console.log("/jbapi/blastregion");
    console.log(region);

    
    //todo: verify the operation can be run
    // for example, if it is already running, don't run again.
    
    
    var d = new Date();
    
    var theFile = "jbrowse_"+d.getTime()+".fa";
    
    // write the received region into a file
    // todo: handle errors
    ws = fs.createWriteStream(g.jbrowse.filePath+theFile);
    ws.write(region);
    ws.end();
    
    // import into galaxy
    importFiles(g.jbrowse.urlPath+theFile,function(data) {
        console.log("completed import");
        
        var args = {
            hid: data.outputs[0].hid,
            id: data.outputs[0].id,
            name: "blast "+path.basename(data.outputs[0].name)
        };
        
        execTool_megablast(args,function(data) {
            console.log("completed blast submit");
            
            var args = {
                hid: data.outputs[0].hid,
                id: data.outputs[0].id,
                name: data.outputs[0].name
            };
            
            execTool_blastxml2tab(args,function(data) {
               console.log("completed blastxml2tabular submit "); 
            });
        });

    });
    
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.send({result:"success"});
}

// fetch file(s) from url (import file into galaxy)
function importFiles(theFile,postFn) {
    console.log('uploadFiles()');
    
    var g = sails.config.globals;
    var myPostFn = postFn;
    
    var params = 
    {
            "tool_id": "upload1",
            "history_id": "f597429621d6eb2b",   // must reference a history
            "inputs": {
  
                "dbkey":"?",
                "file_type":"auto",
                "files_0|type":"upload_dataset",
                "files_0|space_to_tab":null,
                "files_0|to_posix_lines":"Yes",
                "files_0|url_paste":theFile,
                "files_0|name":"test-test"
            }
    };  
    var jsonstr = JSON.stringify(params);

    request.post({
        url: g.jbrowse.galaxyUrl+"/api/tools"+"?key="+g.jbrowse.galaxyAPIKey, 
        method: 'POST',
        //qs: params,
        headers: {
            'Accept-Encoding' : 'gzip, deflate',
            'Accept-Language' : 'en-US,en;q=0.5',
            'Content-Length' : jsonstr.length
        },
        json: params
    }, function(error, response, body){
        if(error) {
            console.log(error);
        } else {
            //console.log(response.statusCode, body);
            //JSON.stringify(eval("(" + str + ")"));
            //var result = JSON.parse(body);
            var result = body;
            console.dir(result);
            console.log("imported:");
            console.log(result.outputs[0].hid);
            console.log(result.outputs[0].id);
            console.log(result.outputs[0].name);
            myPostFn(result);
        }
    });    
    
}

// run blast
function execTool_megablast(args,postFn){
    console.log('execTool_blastPlus()');
    console.dir(args);
    var myPostFn = postFn;
    var g = sails.config.globals;
    
    // todo: pass in the current history somehow
    
    // megablast
    /*
    var params = 
    {
      "tool_id":"toolshed.g2.bx.psu.edu/repos/devteam/megablast_wrapper/megablast_wrapper/1.2.0",
      "tool_version":"1.2.0",
      "history_id": "f597429621d6eb2b",   // must reference a history, todo: make this a variable
      "inputs":{
        "input_query":{
          "batch":false,
          "values":[
            {
              "hid": args.hid, 
              "id": args.id, 
              "name": args.name,
              "src":"hda"
            }
          ]
                
        },
        "source_select":"13apr2014-htgs",   // todo: make this all the following configurable
        "word_size":"28",
        "iden_cutoff":"90",
        "evalue_cutoff":"0.001",
        "filter_query":"yes"
      }
    };
    */
   // NCBI Blast
    var params = 
    {
      "tool_id":"toolshed.g2.bx.psu.edu/repos/devteam/ncbi_blast_plus/ncbi_blastn_wrapper/0.1.07",
      "tool_version":"0.1.07",
      "history_id": "f597429621d6eb2b",   // must reference a history, todo: make this a variable
      "inputs":{
        "query":{
          "batch":false,
          "values":[
            {
              "hid": args.hid, 
              "id": args.id, 
              "name": args.name,
              "src":"hda"
            }
          ]
        },
        "db_opts|db_opts_selector":"db",
        "db_opts|database":"17apr2014-nt",
        "db_opts|histdb":"",
        "db_opts|subject":"",
        "blast_type":"blastn",
        "evalue_cutoff":"0.001",
        "output|out_format":"5",
        "adv_opts|adv_opts_selector":"basic"
      }
    };    
    
    var jsonstr = JSON.stringify(params);

    request.post({
        url: g.jbrowse.galaxyUrl+"/api/tools"+"?key="+g.jbrowse.galaxyAPIKey, 
        method: 'POST',
        //qs: params,
        headers: {
            //'Content-Type': 'application/json',
            //'Accept':'application/json, text/javascript, */*; q=0.01',
            'Accept-Encoding' : 'gzip, deflate',
            'Accept-Language' : 'en-US,en;q=0.5',
            'Content-Length' : jsonstr.length
            //'Referrer':galaxyUrl,
            //'X-Requested-With':'XMLHttpRequest'
        },
        json: params
    }, function(error, response, body){
        if(error) {
            console.log(error);
        } else {
            var result = body;
            //console.log(response.statusCode, body);
            myPostFn(result);
        }
    });    
    
}
// run Blast XML to Tabular
function execTool_blastxml2tab(args,postFn){
    console.log('execTool_blastPlus()');
    console.dir(args);
    var myPostFn = postFn;
    var g = sails.config.globals;
    
    // todo: pass in the current history somehow

    
    
    var params = 
    {
      "tool_id":"toolshed.g2.bx.psu.edu/repos/devteam/ncbi_blast_plus/blastxml_to_tabular/0.1.07",
      "tool_version":"0.1.07",
      "history_id": "f597429621d6eb2b",   // must reference a history, todo: make this a variable
      "inputs":{
        "blastxml_file":{
          "batch":false,
          "values":[
            {
              "hid": args.hid, 
              "id": args.id, 
              "name": args.name,
              "src":"hda"
            }
          ]
        },
        "output|out_format":"ext"
      }
    };
            
    
    var jsonstr = JSON.stringify(params);

    request.post({
        url: g.jbrowse.galaxyUrl+"/api/tools"+"?key="+g.jbrowse.galaxyAPIKey, 
        method: 'POST',
        //qs: params,
        headers: {
            //'Content-Type': 'application/json',
            //'Accept':'application/json, text/javascript, */*; q=0.01',
            'Accept-Encoding' : 'gzip, deflate',
            'Accept-Language' : 'en-US,en;q=0.5',
            'Content-Length' : jsonstr.length
            //'Referrer':galaxyUrl,
            //'X-Requested-With':'XMLHttpRequest'
        },
        json: params
    }, function(error, response, body){
        if(error) {
            console.log(error);
        } else {
            var result = body;
            //console.log(response.statusCode, body);
            myPostFn(result);
        }
    });    
    
}
