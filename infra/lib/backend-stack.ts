import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Construct } from 'constructs';
import * as path from 'path';

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda function — secrets passed as plaintext env vars at deploy time
    const fn = new lambdaNode.NodejsFunction(this, 'Handler', {
      entry: path.join(__dirname, '../../backend/server/lambda.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(29),
      environment: {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
        LANGCHAIN_API_KEY: process.env.LANGCHAIN_API_KEY ?? '',
        LANGCHAIN_TRACING_V2: 'true',
        LANGCHAIN_PROJECT: 'live-session-analysis',
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        format: lambdaNode.OutputFormat.CJS,
        externalModules: ['@aws-sdk/*'],
      },
    });

    // HTTP API Gateway
    const httpApi = new apigw.HttpApi(this, 'HttpApi', {
      apiName: 'live-session-api',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigw.CorsHttpMethod.ANY],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Catch-all route → Lambda
    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigw.HttpMethod.ANY],
      integration: new integrations.HttpLambdaIntegration(
        'LambdaIntegration',
        fn,
      ),
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'HTTP API Gateway URL',
    });
  }
}
