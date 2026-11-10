# VISTA AWS infrastructure and deployment handoff

**Live-production warning:** `skynex.best` currently uses a custom ACM certificate, Route 53 records, and CloudFront → HTTPS `api.skynex.best` → nginx on the existing EC2 instance. Read-only verification on 2026-11-10 confirmed the API and web paths return HTTP 200, the web CloudFront distribution is enabled/deployed, and the EC2 security group permits inbound TCP 80 and 443 from `0.0.0.0/0`. That public ingress differs from the local Terraform draft, which describes an earlier HTTP-only CloudFront-origin option and default CloudFront certificate. Do not apply Terraform to Production until its state and configuration are reconciled with the live resources. The GitHub Actions workflow only deploys application artifacts; it does not update nginx, TLS, DNS, or EC2 user data.

This stack targets `ap-southeast-1`. It creates one Amazon Linux 2023 `t3.medium` EC2 instance, ECR, private web, Learning Media and AI Model Artifacts buckets, CloudFront/OAC, CloudWatch, Secrets Manager, and GitHub OIDC deploy roles. It does **not** create an ALB, NAT gateway, IoT Core, Lambda, database, robot runtime, SageMaker, GPU EC2, or AI inference service. The application database and identity provider remain in Supabase. MQTT stays disabled by default in production; set `MQTT_ENABLED=true` only when a broker is deliberately provisioned.

## Security gate: API ingress

`enable_insecure_api_origin` defaults to `false`. With that setting, EC2 has no inbound rule and CloudFront has no API origin. The web site can be published, and the API can be deployed and health checked locally through SSM, but browser API calls cannot work. This is intentional.

CloudFront's default domain supplies browser-facing HTTPS. Without a domain name and trusted certificate for EC2, CloudFront cannot use verified HTTPS to this origin. Setting `enable_insecure_api_origin = true` adds an HTTP origin and permits CloudFront origin-facing IPs to connect to port 80. It forwards JWT Bearer credentials on an **unencrypted CloudFront-to-EC2 hop**. The security group and origin IP restriction do not encrypt traffic. Do not enable this for real user credentials or production secrets without explicit approval. A domain with a trusted origin certificate is the preferred upgrade. An ALB plus certificate still needs a name whose certificate can be validated. AWS documentation: [CloudFront origin TLS](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html), [CloudFront default HTTPS](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-https-alternate-domain-names.html).

No application files or Terraform defaults bypass this gate. It describes the local Terraform draft, not the live production distribution, which already uses HTTPS `api.skynex.best`. Do not enable the insecure origin to reconcile Terraform with production.

## Estimated monthly cost before provisioning

Assumptions: 730 instance hours/month, Linux on-demand `t3.medium`, 20 GiB gp3, one public IPv4, low demo traffic, two small existing S3 buckets, an empty AI models bucket, one Secrets Manager secret, 14-day logs, modest ECR images. **Planning estimate: USD 45–75/month before model storage**, plus traffic-dependent CloudFront/S3/CloudWatch/ECR charges and any taxes. EC2 is likely the dominant item (roughly USD 35–45/month in Singapore); public IPv4 is USD 0.005/hour, about USD 3.65/month. The estimate excludes Supabase, high data transfer, CPU credit overage, AWS support and domain cost. Verify the exact account/region quote in [AWS Pricing Calculator](https://calculator.aws/) before approval; [AWS EC2 pricing](https://aws.amazon.com/ec2/pricing/on-demand/) and [VPC pricing](https://aws.amazon.com/vpc/pricing/) are the price sources. CloudFront can remain deployed with API ingress disabled, but EC2 still accrues charges while running.

Model artifact storage is usage-based: total current **and retained noncurrent** GiB-months multiplied by the `ap-southeast-1` S3 Standard rate, plus PUT/GET requests and applicable data transfer. For budgeting, at an illustrative USD 0.025/GB-month, 100 GB retained for a full month costs about USD 2.50 in storage; 100 GB of old versions would add another USD 2.50. Confirm the live regional rate and transfer assumptions in [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/) and [AWS Pricing Calculator](https://calculator.aws/). [S3 Versioning charges for each retained version](https://aws.amazon.com/s3/faqs/). The lifecycle retains current artifacts, expires noncurrent versions after 180 days and aborts incomplete multipart uploads after 7 days.

## AI Model Artifacts integration

Set `ai_models_bucket_name` in `terraform.tfvars` to an available, globally unique name. The example uses `vista-demo-ai-models-157098813811-sg`; the default is a non-sensitive placeholder and must be replaced before provisioning. The bucket has all four S3 Block Public Access settings, bucket-owner-enforced ownership, AES-256 server-side encryption, versioning and an HTTPS-only bucket policy. There are no public read/write grants, website hosting, CORS rules or CloudFront origin for model artifacts. `force_destroy = false` protects stored models from an accidental Terraform bucket deletion.

Terraform creates two **unattached** IAM managed policies, scoped to `models/*`: `ai_models_upload_policy_arn` allows `PutObject` and `AbortMultipartUpload`; `ai_models_download_policy_arn` allows `GetObject`. Neither permits listing the bucket or reading/writing outside that prefix. After a model pipeline and Robot Runtime/Edge Agent identities exist, attach only the corresponding policy to their explicitly authorized IAM roles. The upload pipeline should publish versioned keys or a signed manifest, and the runtime should request a known object key over HTTPS. Add a trust policy and workload authentication for those roles as part of that later integration. Do not attach either policy to the frontend, GitHub web deploy role, browser users or existing API instance role. No model is uploaded and no runtime download path is created by this Terraform change.

## Safe remote state bootstrap

The following creates paid AWS resources. Run **only after reviewing the cost estimate and approving provisioning**. Use an AWS identity allowed to create the listed resources. Choose three globally unique bucket names. Do not put passwords in `terraform.tfvars` or Terraform state.

```bash
cd /home/quangduc/Code/vista/se/infra/terraform
export AWS_REGION=ap-southeast-1
export TF_STATE_BUCKET=<globally-unique-state-bucket>
aws s3api create-bucket --bucket "$TF_STATE_BUCKET" --region "$AWS_REGION" --create-bucket-configuration LocationConstraint="$AWS_REGION"
aws s3api put-public-access-block --bucket "$TF_STATE_BUCKET" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$TF_STATE_BUCKET" --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-bucket-versioning --bucket "$TF_STATE_BUCKET" --versioning-configuration Status=Enabled
cp backend.hcl.example backend.hcl
cp terraform.tfvars.example terraform.tfvars
# Edit backend.hcl: bucket=<state bucket>; edit terraform.tfvars: three globally unique app buckets.
terraform init -backend-config=backend.hcl
terraform fmt -check -recursive
terraform validate
terraform plan -out=deployment.tfplan
terraform show deployment.tfplan
# Stop here for explicit approval. Never apply an unreviewed plan.
terraform apply deployment.tfplan
```

The S3 backend uses `use_lockfile = true` (Terraform >=1.10) and bucket versioning. `backend.hcl`, `terraform.tfvars`, state and plan files are gitignored; keep the state bucket private and access limited to the Terraform operator. Do not delete its object versions during normal operations. If the GitHub OIDC provider already exists in the account, import it rather than creating a duplicate.

## Populate application configuration after apply

Terraform creates the secret **without a version**; its value is never stored in state. Supply one JSON object using the AWS console or a protected local file. Required keys: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEB_ORIGIN`. Recommended keys: `SUPABASE_JWT_ISSUER`, `SUPABASE_JWKS_URL`, `SUPABASE_JWT_AUDIENCE`, `SUPABASE_INVITE_REDIRECT_URL`, `ROBOT_PROGRAM_MAX_STEPS`, `ROBOT_PROGRAM_MAX_BYTES`, `HTTP_BODY_LIMIT_BYTES`. For the live domain, `WEB_ORIGIN` must allow the actual HTTPS frontend origins, including `https://skynex.best`; verify the existing secret without printing it. The Supabase URL uses HTTPS. `DATABASE_URL` uses the Supabase session pooler on 5432 with `sslmode=require` or `verify-full` and a measured `connection_limit`; never put it in GitHub variables or a Vite build. Store the JSON value by a protected operator action, then remove the local plaintext file. Do **not** run production Prisma migrations automatically. Verify migration status separately against Supabase before first user traffic.

After approved `terraform apply`, a protected operator can create the first secret version with `aws secretsmanager put-secret-value --secret-id "$(terraform output -raw api_secret_arn)" --secret-string file:///path/to/protected/api-env.json`. Ensure the JSON file is mode `0600`, never commit it, and remove it after verifying the secret version exists. Do not paste secret values into a terminal command line or GitHub workflow.

Terraform replaces the EC2 instance when its bootstrap user-data changes. Review every future plan for replacement and schedule API downtime accordingly; the Elastic IP remains stable.

## Activate GitHub Actions

The existing `.github/workflows/backend-ci.yml` runs CI on pull requests and deploys only after a successful push to `main` or a manual dispatch on `main`. Production deployments are gated by the repository variable `AWS_DEPLOY_ENABLED=true` and GitHub environment `aws-demo`. Keep the gate disabled until the workflow is reviewed on a feature branch, merged through `develop` to `main`, the live IAM policy is updated, and the environment has required reviewers. Protect `develop` and `main` with PR reviews and required Education CI checks. The workflow selects API and web deployment by changed paths (`services/education-api/`, `web/robot-edu/`, and shared `packages/contracts/`); manual `deploy` selects both, while manual `rollback` selects only the API. If both change, API deployment and public health checks must succeed before web publication.

Configure these GitHub values for the existing AWS account. Use the live resource IDs below until Terraform has been reconciled with production:

| GitHub variable | Live production value |
| --- | --- |
| `AWS_API_DEPLOY_ROLE_ARN` | `arn:aws:iam::157098813811:role/vista-demo-github-api-deploy` |
| `AWS_WEB_DEPLOY_ROLE_ARN` | `arn:aws:iam::157098813811:role/vista-demo-github-web-deploy` |
| `API_INSTANCE_ID` | `i-0fa8cb318ce21afa5` |
| `ECR_REPOSITORY_URL` | `157098813811.dkr.ecr.ap-southeast-1.amazonaws.com/vista/demo/education-api` |
| `WEB_BUCKET` | `vista-demo-web-157098813811-sg` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `E1A274BBLHUGAO` |
| `PUBLIC_SUPABASE_URL` | public Supabase project URL |
| `AWS_DEPLOY_ENABLED` | repository variable; keep unset or `false` until all first-deployment checks below pass |

GitHub environment secret name: `PUBLIC_SUPABASE_ANON_KEY` (publishable client key only). No long-lived AWS key or Supabase service role key belongs in GitHub. The EC2 instance reads its server-only secret from Secrets Manager. The live OIDC roles were verified to trust the repository subject `repo:SKYNET-Thesis/se:environment:aws-demo`; the workflow separately limits deployment jobs to `main` and the `aws-demo` environment. GitHub environment reviewers and variable/secret values were not verified in this audit. The workflow builds `VITE_API_BASE_URL=/api/v1`, verifies API health through `https://api.skynex.best` and `https://skynex.best`, waits for CloudFront invalidation, then checks `https://skynex.best/`. The API image tag is the exact commit SHA; a manual redeploy reuses an existing immutable image. The on-instance script rolls back after a failed local health check, but a public HTTPS health failure after SSM success requires operator intervention. First deployment has no previous image to restore.

**IAM verification (2026-11-10):** the live API deploy role already allows `ecr:DescribeImages` scoped to the existing Education API repository; no IAM change is pending for this permission. Its trust policy is scoped to the `aws-demo` GitHub environment. The web role allows access to the configured S3 bucket and CloudFront distribution. The EC2 instance role has SSM managed-instance access and scoped ECR pull, Secrets Manager read, and CloudWatch Logs permissions. Do not reapply the previously proposed `ecr:DescribeImages` change. Do not run a full Terraform apply while CloudFront, ACM, Route 53, security group and EC2 user data differ from Production.

**Remaining verification:** AWS account/region identity, instance health, SSM online status, ECR repository, CloudFront state, S3 region, secret metadata, role policies, and public health endpoints were checked read-only on 2026-11-10. The API secret has an `AWSCURRENT` version, but its contents were not read. GitHub Actions variables, the `PUBLIC_SUPABASE_ANON_KEY` secret, environment reviewers, `AWS_DEPLOY_ENABLED`, and workflow run status remain unverified because the GitHub CLI was unavailable.

Create the `aws-demo` GitHub environment and required reviewers in repository Settings → Environments. Then, from this directory with `gh` authenticated to the repository, set output-backed environment variables:

```bash
gh variable set AWS_API_DEPLOY_ROLE_ARN --env aws-demo --body 'arn:aws:iam::157098813811:role/vista-demo-github-api-deploy'
gh variable set AWS_WEB_DEPLOY_ROLE_ARN --env aws-demo --body 'arn:aws:iam::157098813811:role/vista-demo-github-web-deploy'
gh variable set API_INSTANCE_ID --env aws-demo --body 'i-0fa8cb318ce21afa5'
gh variable set ECR_REPOSITORY_URL --env aws-demo --body '157098813811.dkr.ecr.ap-southeast-1.amazonaws.com/vista/demo/education-api'
gh variable set WEB_BUCKET --env aws-demo --body 'vista-demo-web-157098813811-sg'
gh variable set CLOUDFRONT_DISTRIBUTION_ID --env aws-demo --body 'E1A274BBLHUGAO'
gh variable set PUBLIC_SUPABASE_URL --env aws-demo --body 'https://<project-ref>.supabase.co'
gh secret set PUBLIC_SUPABASE_ANON_KEY --env aws-demo
# Paste only the public client key into the secure gh prompt.
# Only after the first-deployment checks below are approved:
gh variable set AWS_DEPLOY_ENABLED --body true
```

## Checks before the first workflow deployment

1. Review and merge the local workflow changes through a PR into `develop`, then a PR into protected `main`. Confirm CI checks and environment reviewers are enforced; keep `AWS_DEPLOY_ENABLED` disabled during those merges.
2. The live OIDC roles, ECR repository, EC2 instance, SSM agent, web bucket, CloudFront distribution, and Secrets Manager current-version metadata were confirmed on 2026-11-10. Verify the installed deploy/rollback scripts and nginx configuration using an approved host-level inspection; this audit did not send SSM commands.
3. No `ecr:DescribeImages` change is required; the live API role already has it. Confirm the secret contains required application keys through a protected check that does not emit values into GitHub or logs. Keep Terraform apply blocked until the local/live network, TLS, DNS, security group, and EC2 bootstrap differences are reconciled.
4. Set the GitHub environment variables and publishable Supabase key. Confirm the environment approval gate works. Set `AWS_DEPLOY_ENABLED=true` only after those checks. Run `workflow_dispatch` with `action=deploy` on `main` under supervision, verify the SHA image, SSM result and all public health checks, then permit automatic main pushes.

For read-only verification after an approved deployment:

```bash
aws ssm describe-instance-information --region ap-southeast-1 --filters Key=InstanceIds,Values=i-0fa8cb318ce21afa5
aws ecr describe-images --region ap-southeast-1 --repository-name vista/demo/education-api
curl -f https://api.skynex.best/api/v1/health
curl -f https://skynex.best/api/v1/health
curl -I https://skynex.best/
```

Use SSM Run Command or Session Manager to check `docker ps`, `docker inspect --format '{{json .State.Health}}' vista-education-api`, and `curl -f http://127.0.0.1:3000/api/v1/health` on EC2. Check CloudWatch logs and alarms, Supabase Auth sign-in, course list, ProgramVersion, schematic run and symbolic PASS/FAIL with synthetic users. For live production, verify `/api/v1/*` through `https://skynex.best` preserves Authorization, methods, query strings, CORS and no-cache behavior in a real browser. The Learning Media bucket has no presigned upload or authorized download API yet; it is infrastructure only.

S3 CORS is an origin hint, not authorization or a file-size limit. The future presigned upload API must enforce instructor permissions, approved MIME types and per-file byte limits before signing, then verify metadata after upload.

## Rollback

Run GitHub Actions `Education CI` → `Run workflow` on `main` → `action=rollback` for the API. This bypasses current-commit tests and image build, uses `/opt/vista/previous-image` through SSM, and checks the public API endpoints. The on-instance script also attempts automatic rollback if a newly started container fails its local health check. If only the public HTTPS check fails, inspect CloudWatch/SSM and nginx, then initiate a supervised rollback. The workflow does not implement frontend rollback; restore the previous web artifact manually through a reviewed operation if needed. Rollback does not reverse database migrations; keep them separately controlled and backward compatible.
