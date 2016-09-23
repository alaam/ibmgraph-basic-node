var express = require('express');
var cfenv = require('cfenv');
var app = express();
var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));
var request = require('request-promise'); /* Note: using promise-friendly lib */
var uuid = require('node-uuid');
var appEnv = cfenv.getAppEnv();
var util = require('util');
var schema = require('./schema.json');
var nxnwschema = require('./nxnw_schema.json');

app.set('port', 8181);
app.use(express.static(__dirname + '/public'));

// start server on the specified port and binding host
app.listen(appEnv.port, '0.0.0.0', function () {
    // print a message when the server starts listening
    console.log('server starting on ' + appEnv.url);
});

//---------------------------------------------------------------------------------
var apiURL; var username; var password; var baseURL;
if (process.env.VCAP_SERVICES) {
  var vcapServices = JSON.parse(process.env.VCAP_SERVICES);
  var graphService = 'IBM Graph';
  if (vcapServices[graphService] && vcapServices[graphService].length > 0) {
    var tp3 = vcapServices[graphService][0];
    apiURL = tp3.credentials.apiURL;
    username = tp3.credentials.username;
    password = tp3.credentials.password;
    baseURL = apiURL.split('/g').join('');
  }
}
else
{
    apiURL = '<Instance API Url that you got from bluemix service instance credentials>';
    username ='<Instance user name that you got from bluemix service instance credentials>';
    password ='<Instance credentials that you got from bluemix service instance credentials>';
    baseURL = apiURL.split('/g').join('');
    graphname='nxnw4';
}
console.log('base url is '+baseURL);
console.log('username '+username);
console.log('password'+password);
//---------------------------------------------------------------------------------
var sessionToken;
var getTokenOpts = {
    method: 'GET',
    uri: baseURL + '/_session',
    auth: {user: username, pass: password},
    json: true
};
request(getTokenOpts).then(function (body) {
   sessionToken = 'gds-token ' + body['gds-token'];
   console.log('token is '+sessionToken);

  //Authorization ---------------------------------------------------------------------------------
  graphCreateOpts= {
          method: 'POST',
          headers: {'Authorization': sessionToken},
          uri: baseURL + '/_graphs/'+graphname,
          json: true
      };
  request(graphCreateOpts).then(function (body) {
     apiURL = body.dbUrl; //Update apiURL to use new graph
    console.log('update graph: response '+body);

    //Schema ---------------------------------------------------------------------------------
    //Now send the request to IBM Graph
    var postSchemaOpts = {
        method: 'POST',
        headers: {'Authorization': sessionToken},
        uri: apiURL + '/schema',
//        json:schema 
        json: nxnwschema
    };
    request(postSchemaOpts).then(function(body){
      console.log('schema : response '+body);
      //Bulkload
      var bulkUploadOpts = {
      method: 'POST',
      headers: {'Authorization': sessionToken},
      uri: apiURL + '/bulkload/graphson',
      formData: {
        'graphson': fs.createReadStream(__dirname +'/nxnw_dataset.json'),
        'type': 'application/json'
      }
      };
      request(bulkUploadOpts).then(function (body){
         console.log('Our file was uploaded and the result was : ' + body);

         var body = {
             // 'gremlin': 'def g = graph.traversal(); g.V(' + vertex1 + ').outE().inV()'
             'gremlin': 'def g = graph.traversal(); g.V().has("gender","male")'
         };
         var gremlinQueryOpts = {
             method: 'POST',
             headers: {'Authorization': sessionToken},
             uri: apiURL + '/gremlin',
             json: body
         };
         request(gremlinQueryOpts).then(function(body) {
             for (var i = 0; i < body.result.data.length; i++) {
                 console.log('successfully found this vertex : ' +
                     JSON.stringify(body.result.data[i]));
             }
         });
      });
      //Vertex ---------------------------------------------------------------------------------
      var vertex1;
      var body = {
          'label': 'tweet',
          'properties': {
              'tweet': 'I love brownies #baking @Joseph',
              'tone': 'excited',
              'sentiment': 'loving'
          }
      };
      var postVertexOpts = {
          method: 'POST',
          headers: {'Authorization': sessionToken},
          uri: apiURL + '/vertices',
          json: body
      };
      request(postVertexOpts).then(function (body) {
          vertex1 = body.result.data[0].id;
          console.log('vertex id : '+vertex1);

          //Create Edge ---------------------------------------------------------------------------------
          // To create an edge, we must first create another vertex1
          var vertex2; var edge1;
          var body = {
              'label': 'person',
              'properties': {
                  'name': 'David',
                  'verified': false
              }
          };
          var postVertexOpts = {
              method: 'POST',
              headers: {'Authorization': sessionToken},
              uri: apiURL + '/vertices',
              json: body
          };
          request(postVertexOpts).then(function (body) {
              vertex2 = body.result.data[0].id;
              // Now we can create an edge from vertex2 to vertex1
              var body = {
                  'inV': vertex1,
                  'outV': vertex2,
                  'label': 'tweets'
              };
              var postEdgeOpts = {
                  method: 'POST',
                  headers: {'Authorization': sessionToken},
                  uri: apiURL + '/edges',
                  json: body
              };
              request(postEdgeOpts).then(function (body) {
                  edge1 = body.result.data[0].id;
              })
              });
          });
        })
    });
  });

