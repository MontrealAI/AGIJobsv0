import { GraphQLClient, gql } from "graphql-request";

export const createClient = (url: string) => new GraphQLClient(url);

export const JOBS_QUERY = gql`
  {
    jobs(first: 50, orderBy: id, orderDirection: desc) {
      id
      employer
      reward
      uri
      status
      validators {
        account
      }
    }
  }
`;
