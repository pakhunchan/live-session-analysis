import * as cdk from 'aws-cdk-lib';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import * as path from 'path';

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC — public subnets only, no NAT gateway (saves ~$32/mo)
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

    // EC2 capacity via Launch Template (Launch Configurations are deprecated)
    const role = new iam.Role(this, 'Ec2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonEC2ContainerServiceforEC2Role',
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonSSMManagedInstanceCore',
        ),
      ],
    });

    const sg = new ec2.SecurityGroup(this, 'Ec2Sg', {
      vpc,
      allowAllOutbound: true,
    });

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      `echo ECS_CLUSTER=${cluster.clusterName} >> /etc/ecs/ecs.config`,
    );

    const launchTemplate = new ec2.LaunchTemplate(this, 'LaunchTemplate', {
      instanceType: new ec2.InstanceType('t3.small'),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2023(),
      role,
      securityGroup: sg,
      userData,
      associatePublicIpAddress: true,
    });

    const asg = new autoscaling.AutoScalingGroup(this, 'Asg', {
      vpc,
      launchTemplate,
      minCapacity: 1,
      maxCapacity: 1,
      desiredCapacity: 1,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const capacityProvider = new ecs.AsgCapacityProvider(
      this,
      'AsgCapacityProvider',
      { autoScalingGroup: asg },
    );
    cluster.addAsgCapacityProvider(capacityProvider);

    // ALB + ECS Service
    const service = new ecsPatterns.ApplicationLoadBalancedEc2Service(
      this,
      'Service',
      {
        cluster,
        taskImageOptions: {
          image: ecs.ContainerImage.fromAsset(
            path.join(__dirname, '../..'),
            {
              platform: cdk.aws_ecr_assets.Platform.LINUX_AMD64,
              file: 'backend/Dockerfile',
            },
          ),
          containerPort: 3001,
          environment: {
            OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
            LANGCHAIN_API_KEY: process.env.LANGCHAIN_API_KEY ?? '',
            LANGCHAIN_TRACING_V2: 'true',
            LANGCHAIN_PROJECT: 'live-session-analysis',
            LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY ?? '',
            LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET ?? '',
            NODE_OPTIONS: '--enable-source-maps',
          },
        },
        memoryLimitMiB: 896,
        desiredCount: 1,
        publicLoadBalancer: true,
      },
    );

    // Health check
    service.targetGroup.configureHealthCheck({
      path: '/api/health',
      interval: cdk.Duration.seconds(30),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    });

    // ALB idle timeout — 120s for WebSocket headroom (heartbeat every 30s)
    service.loadBalancer.setAttribute(
      'idle_timeout.timeout_seconds',
      '120',
    );

    // Stickiness — cookie-based, 24h (WebSocket affinity)
    service.targetGroup.setAttribute('stickiness.enabled', 'true');
    service.targetGroup.setAttribute('stickiness.type', 'lb_cookie');
    service.targetGroup.setAttribute(
      'stickiness.lb_cookie.duration_seconds',
      '86400',
    );

    // Allow ALB to reach ECS tasks on dynamic ports (sets both ALB egress + EC2 ingress)
    service.loadBalancer.connections.allowTo(
      sg,
      ec2.Port.tcpRange(32768, 65535),
      'ALB to ECS dynamic ports',
    );

    // HTTPS listener with ACM certificate
    const certificate = certificatemanager.Certificate.fromCertificateArn(
      this,
      'Certificate',
      'arn:aws:acm:us-west-2:044251533722:certificate/267e66bf-6ea0-4b34-8370-5d84786c447b',
    );

    service.loadBalancer.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      defaultTargetGroups: [service.targetGroup],
    });

    // Route53 A record: lsa-api.pakhunchan.com → ALB
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      'HostedZone',
      {
        hostedZoneId: 'Z0255377ZXTWG9Y34QQT',
        zoneName: 'pakhunchan.com',
      },
    );

    new route53.ARecord(this, 'ApiDnsRecord', {
      zone: hostedZone,
      recordName: 'lsa-api',
      target: route53.RecordTarget.fromAlias(
        new route53targets.LoadBalancerTarget(service.loadBalancer),
      ),
    });

    // Outputs
    new cdk.CfnOutput(this, 'AlbDns', {
      value: service.loadBalancer.loadBalancerDnsName,
      description: 'ALB DNS name',
    });

    new cdk.CfnOutput(this, 'AlbUrl', {
      value: 'https://lsa-api.pakhunchan.com',
      description: 'ALB URL',
    });
  }
}
