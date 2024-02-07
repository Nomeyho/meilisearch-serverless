import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from "aws-cdk-lib/aws-apigatewayv2";
import * as api_integration from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { Construct } from 'constructs';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'meilisearch-vpc', {
      vpnGateway: false,
      natGateways: 0,
      vpcName: 'meilisearch-vpc',
    })

    const filesystem = new efs.FileSystem(this, 'meilisearch-fs', {
      vpc: vpc,
      fileSystemName: 'meilisearch-fs',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })

    const accessPoint = filesystem.addAccessPoint('meilisearch-ap', {
      path: '/efs',
      posixUser: {
        uid: '1000',
        gid: '1000'
      },
      createAcl: {
        ownerUid: '1000',
        ownerGid: '1000',
        permissions: '0777'
      }
    })

    const meilisearchLambda = new lambda.DockerImageFunction(this, 'meilisearch-lambda', {
      code: lambda.DockerImageCode.fromImageAsset('.'),
      timeout: cdk.Duration.seconds(10),
      vpc: vpc,
      filesystem: lambda.FileSystem.fromEfsAccessPoint(accessPoint, '/mnt/efs'),
      memorySize: 256,
      architecture: lambda.Architecture.ARM_64, // on MAC M1
      environment: {
        // Lambda adapter
        AWS_LWA_PORT: '7700',
        AWS_LWA_READINESS_CHECK_PATH: '/health',
        AWS_LWA_READINESS_CHECK_PORT: '7700',
        // Meilisearch config
        MEILI_DB_PATH: '/mnt/efs/data',
        MEILI_DUMP_DIR:	'/mnt/efs/dump',
        MEILI_MASTER_KEY:	'GGw7L_1DRq5JhbPqygLdEjM-Tz10puQwXHXqfctjRY',
        MEILI_SEARCH_KEY_ID: 'd294cf7b-aa18-47a5-9714-ddc67ca9fc47',
        MEILI_SNAPSHOT_DIR:	'/mnt/efs/snapshot',
      }
    });

    const integration = new api_integration.HttpLambdaIntegration('meilisearch-integration', meilisearchLambda)
    const api = new apigateway.HttpApi(this, 'meilisearch-api')
    api.addRoutes({
      path: '/{proxy+}',
      methods: [apigateway.HttpMethod.ANY],
      integration: integration,
    })
  }
}
